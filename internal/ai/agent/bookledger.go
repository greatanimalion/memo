package agent

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"sort"
	"strings"

	"memo/internal/ai/llm"
	"memo/internal/db"
)

// 台账编排层：把「上下文是容量、数据库才是记忆力」落到调度代码里。
// 这里负责章纲解析、按需激活角色 Agent、分层组装记忆、定稿写回台账，
// 以及 Guard 的确定性预警。所有写回只发生在定稿之后，草稿不污染记忆。

const (
	// bookAgentMaxCastPerChapter 限制单章激活的角色 Agent 数量，避免成本失控。
	bookAgentMaxCastPerChapter = 4
	// bookAgentRecentEventWindow 是角色/情节检索的章节窗口。
	bookAgentRecentEventWindow = 3
	// bookAgentForeshadowGrace 是伏笔允许超期的章数，超过即预警。
	bookAgentForeshadowGrace = 3
)

// architectCharacter 是 Architect 输出的角色基础档案。
type architectCharacter struct {
	Name       string `json:"name"`
	Importance string `json:"importance"`
	Profile    string `json:"profile"`
}

// architectChapter 是 Architect 输出的章纲（含功能槽位）。
type architectChapter struct {
	Title             string   `json:"title"`
	Summary           string   `json:"summary"`
	Characters        []string `json:"characters"`
	Slots             []string `json:"slots"`
	Location          string   `json:"location"`
	NarrativeTime     string   `json:"narrativeTime"`
	Foreshadow        string   `json:"foreshadow"`
	ResolveForeshadow string   `json:"resolveForeshadow"`
}

// architectPlan 是 Architect 的结构化规划结果。
type architectPlan struct {
	Core       string               `json:"core"`
	Synopsis   string               `json:"synopsis"`
	Characters []architectCharacter `json:"characters"`
	Chapters   []architectChapter   `json:"chapters"`
}

// castMember 是本章被激活的角色 Agent。
type castMember struct {
	Name        string
	CharacterID string
	Importance  string
}

// characterChange 是决策包中的一条状态变化。
type characterChange struct {
	Field        string `json:"field"`
	OldValue     string `json:"oldValue"`
	NewValue     string `json:"newValue"`
	Reason       string `json:"reason"`
	TriggerEvent string `json:"triggerEvent"`
}

// characterDecision 是 Character Agent 输出的角色决策包。
type characterDecision struct {
	Character  string            `json:"character"`
	Decision   string            `json:"decision"`
	Actions    []string          `json:"actions"`
	Dialogue   []string          `json:"dialogue"`
	InnerState string            `json:"innerState"`
	Changes    []characterChange `json:"changes"`
}

// bitPlayerProfile 是轻量配角档案生成器的输出。
type bitPlayerProfile struct {
	Name         string `json:"name"`
	Personality  string `json:"personality"`
	FatalMistake string `json:"fatalMistake"`
	Death        string `json:"death"`
	Appearance   string `json:"appearance"`
}

// ──────────────────── 解析 ────────────────────

// extractJSONObject 从可能包含 Markdown 的模型输出中截取第一个完整 JSON 对象。
func extractJSONObject(s string) string {
	start := strings.Index(s, "{")
	if start < 0 {
		return ""
	}
	depth := 0
	inString := false
	escaped := false
	for i := start; i < len(s); i++ {
		ch := s[i]
		if inString {
			switch {
			case escaped:
				escaped = false
			case ch == '\\':
				escaped = true
			case ch == '"':
				inString = false
			}
			continue
		}
		switch ch {
		case '"':
			inString = true
		case '{':
			depth++
		case '}':
			depth--
			if depth == 0 {
				return s[start : i+1]
			}
		}
	}
	return ""
}

// parseArchitectPlan 优先解析 Architect 的结构化 JSON，失败时回退到
// 既有的 Markdown 章节目录解析。
func parseArchitectPlan(content string) (architectPlan, []outlineChapter) {
	var plan architectPlan
	if raw := extractJSONObject(content); raw != "" {
		_ = json.Unmarshal([]byte(raw), &plan)
	}
	chapters := make([]outlineChapter, 0, len(plan.Chapters))
	for _, c := range plan.Chapters {
		title := strings.TrimSpace(c.Title)
		if title == "" {
			continue
		}
		chapters = append(chapters, outlineChapter{
			Title:             title,
			Summary:           strings.TrimSpace(c.Summary),
			Characters:        trimList(c.Characters),
			Slots:             trimList(c.Slots),
			Location:          strings.TrimSpace(c.Location),
			NarrativeTime:     strings.TrimSpace(c.NarrativeTime),
			Foreshadow:        strings.TrimSpace(c.Foreshadow),
			ResolveForeshadow: strings.TrimSpace(c.ResolveForeshadow),
		})
	}
	if len(chapters) == 0 {
		chapters = parseOutlineChapters(content)
	}
	return plan, chapters
}

// parseCharacterDecision 解析角色决策包；无法解析时返回 false，
// 调用方会保留原始文本供 Writer 参考。
func parseCharacterDecision(content string) (characterDecision, bool) {
	var d characterDecision
	raw := extractJSONObject(content)
	if raw == "" || json.Unmarshal([]byte(raw), &d) != nil {
		return d, false
	}
	if d.Character == "" && d.Decision == "" && len(d.Actions) == 0 &&
		len(d.Dialogue) == 0 && len(d.Changes) == 0 {
		return d, false
	}
	return d, true
}

func parseBitPlayer(content string) (bitPlayerProfile, bool) {
	var p bitPlayerProfile
	raw := extractJSONObject(content)
	if raw == "" || json.Unmarshal([]byte(raw), &p) != nil || strings.TrimSpace(p.Name) == "" {
		return p, false
	}
	return p, true
}

func trimList(items []string) []string {
	out := make([]string, 0, len(items))
	for _, item := range items {
		if s := strings.TrimSpace(item); s != "" {
			out = append(out, s)
		}
	}
	return out
}

// ──────────────────── Architect ────────────────────

// applyArchitectPlan 应用 Architect 输出：刷新章纲、角色基础档案与章节游标。
func (r *bookAgentRun) applyArchitectPlan(content string) {
	plan, chapters := parseArchitectPlan(content)
	if len(chapters) > 0 {
		r.outlineChapters = chapters
		r.completedChapters = 0
	} else if len(r.outlineChapters) == 0 {
		r.outlineChapters = []outlineChapter{{Title: "第1章"}}
		r.completedChapters = 0
	}

	profiles := map[string]architectCharacter{}
	for _, c := range plan.Characters {
		name := strings.TrimSpace(c.Name)
		if name == "" {
			continue
		}
		if c.Importance == "" {
			c.Importance = db.CharacterImportanceMain
		}
		n := c
		n.Name = name
		profiles[name] = n
	}
	r.characterProfiles = profiles

	r.resetChapterState()
	if r.board != nil {
		r.board.Plan = content
		r.persistBoard()
	}
}

// ──────────────────── 按需激活 ────────────────────

// prepareChapterCast 只为本章出场的主要角色激活角色 Agent；
// 功能槽位由轻量档案生成器补一个临时配角，不启动完整 Agent。
func (r *bookAgentRun) prepareChapterCast(ctx context.Context) {
	if r.castPrepared {
		return
	}
	r.castPrepared = true
	r.castQueue = nil
	r.chapterBitPlayers = nil

	ch := r.currentChapter()
	chapter := r.chapterNumber()

	for _, name := range trimList(ch.Characters) {
		meta := r.characterProfiles[name]
		importance := meta.Importance
		if importance == "" {
			// 章纲明确点名的出场角色默认按主要角色处理。
			importance = db.CharacterImportanceMain
		}
		c, err := db.UpsertStoryCharacter(&db.StoryCharacter{
			BookID:       r.bookID,
			Name:         name,
			Importance:   importance,
			Profile:      meta.Profile,
			FirstChapter: chapter,
		})
		if err != nil {
			log.Printf("BookAgent 写入角色台账失败: %v", err)
			continue
		}
		if c == nil {
			continue
		}
		if importance == db.CharacterImportanceMain && len(r.castQueue) < bookAgentMaxCastPerChapter {
			r.castQueue = append(r.castQueue, castMember{Name: c.Name, CharacterID: c.ID, Importance: c.Importance})
		}
	}

	for _, slot := range trimList(ch.Slots) {
		if existing := r.findSlotCharacter(slot); existing != nil {
			r.chapterBitPlayers = append(r.chapterBitPlayers, existing.ID)
			continue
		}
		if c := r.generateBitPlayer(ctx, chapter, slot); c != nil {
			r.chapterBitPlayers = append(r.chapterBitPlayers, c.ID)
		}
	}

	for _, name := range splitLocations(ch.Location) {
		if _, err := db.UpsertStoryLocation(&db.StoryLocation{BookID: r.bookID, Name: name}); err != nil {
			log.Printf("BookAgent 写入地点台账失败: %v", err)
		}
	}

	if len(r.castQueue) > 0 && r.sse != nil {
		names := make([]string, 0, len(r.castQueue))
		for _, m := range r.castQueue {
			names = append(names, m.Name)
		}
		r.sse.Write("message", fmt.Sprintf("\n[调度] 第%d章按需激活角色 Agent：%s\n", chapter, strings.Join(names, "、")))
	}
}

func (r *bookAgentRun) findSlotCharacter(slot string) *db.StoryCharacter {
	chars, err := db.ListStoryCharacters(r.bookID)
	if err != nil {
		return nil
	}
	marker := "[槽位] " + slot
	for i := range chars {
		if strings.Contains(chars[i].Profile, marker) {
			return &chars[i]
		}
	}
	return nil
}

// generateBitPlayer 用一次轻量模型调用生成临时配角档案；失败时退回模板，
// 保证流程不中断。
func (r *bookAgentRun) generateBitPlayer(ctx context.Context, chapter int, slot string) *db.StoryCharacter {
	profile := bitPlayerProfile{
		Name:         fmt.Sprintf("临时角色%d%s", chapter, randomSuffix()),
		Personality:  "被功能槽位临时引入的配角",
		FatalMistake: slot,
		Death:        "在本章情节中退场",
		Appearance:   "普通样貌",
	}
	if r.client != nil {
		msgs := []llm.Message{
			{Role: "system", Content: "你是轻量配角档案生成器。根据功能槽位生成一个只服务本章情节的配角，只输出 JSON。"},
			{Role: "user", Content: fmt.Sprintf(
				"功能槽位：%s\n本章：第%d章\n\n输出格式：\n"+
					`{"name":"2-4字姓名","personality":"性格","fatalMistake":"即将犯的错","death":"死亡方式","appearance":"外貌"}`,
				slot, chapter)},
		}
		// 原实现：if msg, err := r.client.Chat(ctx, msgs, nil); err == nil {
		// 	if p, ok := parseBitPlayer(msg.Content); ok {
		if result, err := r.client.Execute(ctx, msgs); err == nil && result.Message != nil {
			if p, ok := parseBitPlayer(result.Message.Content); ok {
				profile = p
			}
		}
	}
	name := strings.TrimSpace(profile.Name)
	if name == "" {
		name = fmt.Sprintf("临时角色%d%s", chapter, randomSuffix())
	}
	// 避免与既有角色重名导致档案被覆盖。
	if existing, _ := db.GetStoryCharacterByName(r.bookID, name); existing != nil {
		name = name + randomSuffix()
	}
	text := fmt.Sprintf("[槽位] %s\n性格: %s\n即将犯的错: %s\n死亡方式: %s\n外貌: %s",
		slot, profile.Personality, profile.FatalMistake, profile.Death, profile.Appearance)
	c, err := db.UpsertStoryCharacter(&db.StoryCharacter{
		BookID:       r.bookID,
		Name:         name,
		Importance:   db.CharacterImportanceBit,
		Profile:      text,
		FirstChapter: chapter,
	})
	if err != nil {
		log.Printf("BookAgent 生成临时配角失败: %v", err)
		return nil
	}
	return c
}

func splitLocations(raw string) []string {
	if strings.TrimSpace(raw) == "" {
		return nil
	}
	return strings.FieldsFunc(raw, func(r rune) bool {
		switch r {
		case '、', ',', '，', '/', ';', '；':
			return true
		}
		return false
	})
}

// resetChapterState 清空与单章相关的运行时状态（不含章节游标）。
func (r *bookAgentRun) resetChapterState() {
	r.chapterID = ""
	r.reworkPending = false
	r.writerRetries = 0
	r.guardRetries = 0
	r.lastVerdict = ""
	r.nodeCalls = map[string]int{}
	r.castPrepared = false
	r.castQueue = nil
	r.decisionPacks = map[string]string{}
	r.chapterBitPlayers = nil
	r.chapterFinalized = false
	// 单章的 Writer 产出计数与工具回放计数一并重置。
	r.writerMisses = 0
	r.toolRounds = 0
	r.writerNudge = false
}

// ──────────────────── 分层上下文 ────────────────────

// currentCastMember 返回当前正在执行的角色 Agent。
func (r *bookAgentRun) currentCastMember() castMember {
	if len(r.castQueue) == 0 {
		return castMember{}
	}
	return r.castQueue[0]
}

// buildCharacterContext 按“自己的轨迹 → 近期事件 → 场景/在场角色 → 章纲需求”
// 的顺序组装角色记忆，避免全表扫描。
func (r *bookAgentRun) buildCharacterContext(member castMember) string {
	c, err := db.GetStoryCharacterByID(member.CharacterID)
	if err != nil || c == nil {
		return "## 角色台账\n\n未找到该角色的台账记录，请仅依据章纲做保守决策。"
	}
	chapter := r.chapterNumber()
	ch := r.currentChapter()

	var sb strings.Builder
	fmt.Fprintf(&sb, "## 你是角色：%s\n\n", c.Name)
	sb.WriteString("### 1. 你的变化轨迹\n")
	fmt.Fprintf(&sb, "- 基础档案：%s\n", clipText(strings.TrimSpace(c.Profile), 400))
	if proj, err := db.ProjectCharacterState(c.ID, chapter); err == nil && proj != nil {
		if len(proj.Fields) == 0 {
			sb.WriteString("- 当前状态：暂无变化记录\n")
		} else {
			keys := make([]string, 0, len(proj.Fields))
			for k := range proj.Fields {
				keys = append(keys, k)
			}
			sort.Strings(keys)
			for _, k := range keys {
				fmt.Fprintf(&sb, "- 当前%s：%s\n", k, proj.Fields[k])
			}
		}
		if len(proj.Events) > 0 {
			sb.WriteString("- 近期变化事件：\n")
			start := len(proj.Events) - 3
			if start < 0 {
				start = 0
			}
			for _, e := range proj.Events[start:] {
				fmt.Fprintf(&sb, "  - [第%d章] %s：%s → %s（%s）\n", e.Chapter, e.Field, e.OldValue, e.NewValue, e.Reason)
			}
		}
	}

	sb.WriteString("\n### 2. 你近期经历的事件\n")
	events, err := db.ListStoryEvents(r.bookID, chapter-bookAgentRecentEventWindow, chapter)
	if err != nil || len(events) == 0 {
		sb.WriteString("- 暂无近期事件记录\n")
	} else {
		for _, e := range events {
			if !containsString(e.CharacterIDs, c.ID) {
				continue
			}
			fmt.Fprintf(&sb, "- [第%d章 %s] %s\n", e.Chapter, e.NarrativeTime, e.Summary)
		}
	}

	sb.WriteString("\n### 3. 当前场景\n")
	if ch.Location != "" {
		sb.WriteString(r.describeLocations(ch.Location))
	} else {
		sb.WriteString("- 地点：未指定\n")
	}
	sb.WriteString("- 在场角色：")
	present := make([]string, 0, len(ch.Characters))
	for _, name := range trimList(ch.Characters) {
		if name != c.Name {
			present = append(present, name)
		}
	}
	if len(present) == 0 {
		sb.WriteString("无\n")
	} else {
		sb.WriteString(strings.Join(present, "、") + "\n")
	}

	sb.WriteString("\n### 4. 本章章纲需求\n")
	fmt.Fprintf(&sb, "- 章节：第%d章《%s》\n", chapter, ch.Title)
	if ch.Summary != "" {
		fmt.Fprintf(&sb, "- 核心事件：%s\n", ch.Summary)
	}
	if ch.NarrativeTime != "" {
		fmt.Fprintf(&sb, "- 叙事时间：%s\n", ch.NarrativeTime)
	}
	sb.WriteString("\n### 输出要求\n")
	sb.WriteString("只输出一个 JSON 决策包：角色名、核心决策、行动、台词、内心状态、状态变化。\n")
	sb.WriteString("状态变化必须有台账中已发生事件作为触发；没有触发事件时 changes 必须为空数组。\n")
	return sb.String()
}

// ledgerSummary 把本章相关的台账状态渲染为紧凑上下文。
func (r *bookAgentRun) ledgerSummary() string {
	chapter := r.chapterNumber()
	ch := r.currentChapter()
	var sb strings.Builder

	if clock, err := db.GetStoryClock(r.bookID); err == nil && clock != nil {
		fmt.Fprintf(&sb, "- 叙事指针：第%d章 %s\n", clock.CurrentChapter, clock.NarrativeTime)
	}

	names := trimList(ch.Characters)
	for _, id := range r.chapterBitPlayers {
		if c, _ := db.GetStoryCharacterByID(id); c != nil {
			names = append(names, c.Name)
		}
	}
	if len(names) > 0 {
		sb.WriteString("### 本章角色当前状态\n")
		seen := map[string]bool{}
		for _, name := range names {
			if seen[name] {
				continue
			}
			seen[name] = true
			c, err := db.GetStoryCharacterByName(r.bookID, name)
			if err != nil || c == nil {
				continue
			}
			sb.WriteString(r.describeCharacter(c, chapter))
		}
	}

	if ch.Location != "" {
		sb.WriteString("### 本章地点状态\n")
		sb.WriteString(r.describeLocations(ch.Location))
	}

	if fs, err := db.ListOpenForeshadows(r.bookID); err == nil && len(fs) > 0 {
		sb.WriteString("### 未回收伏笔\n")
		for _, f := range fs {
			fmt.Fprintf(&sb, "- [第%d章埋设] %s（计划第%d章前回收）\n",
				f.PlantedChapter, f.Description, f.PlannedResolveChapter)
		}
	}
	return strings.TrimSpace(sb.String())
}

func (r *bookAgentRun) describeCharacter(c *db.StoryCharacter, chapter int) string {
	var sb strings.Builder
	fmt.Fprintf(&sb, "- %s（%s，%s）\n", c.Name, c.Importance, c.Status)
	if strings.TrimSpace(c.Profile) != "" {
		fmt.Fprintf(&sb, "  - 基础档案：%s\n", clipText(strings.TrimSpace(c.Profile), 400))
	}
	proj, err := db.ProjectCharacterState(c.ID, chapter)
	if err != nil || proj == nil {
		return sb.String()
	}
	if len(proj.Fields) > 0 {
		keys := make([]string, 0, len(proj.Fields))
		for k := range proj.Fields {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		parts := make([]string, 0, len(keys))
		for _, k := range keys {
			parts = append(parts, k+"="+proj.Fields[k])
		}
		fmt.Fprintf(&sb, "  - 当前状态：%s\n", strings.Join(parts, "；"))
	}
	if len(proj.Events) > 0 {
		start := len(proj.Events) - 2
		if start < 0 {
			start = 0
		}
		for _, e := range proj.Events[start:] {
			fmt.Fprintf(&sb, "  - 变化：[第%d章] %s：%s → %s（%s）\n",
				e.Chapter, e.Field, e.OldValue, e.NewValue, e.Reason)
		}
	}
	return sb.String()
}

func (r *bookAgentRun) describeLocations(raw string) string {
	var sb strings.Builder
	for _, name := range splitLocations(raw) {
		loc, err := db.GetStoryLocationByName(r.bookID, name)
		if err != nil || loc == nil {
			fmt.Fprintf(&sb, "- %s：台账暂无记录\n", name)
			continue
		}
		proj, err := db.ProjectLocationState(loc.ID, r.chapterNumber())
		if err != nil || proj == nil {
			fmt.Fprintf(&sb, "- %s：暂无状态记录\n", name)
			continue
		}
		state := proj.State
		if strings.TrimSpace(state) == "" {
			state = "暂无状态记录"
		}
		fmt.Fprintf(&sb, "- %s：%s\n", name, clipText(state, 300))
	}
	return sb.String()
}

// guardWarnings 把确定性检查结果交给 Guard，避免完全依赖模型判断。
func (r *bookAgentRun) guardWarnings() string {
	chapter := r.chapterNumber()
	var warnings []string
	open, err := db.ListOpenForeshadows(r.bookID)
	if err == nil {
		for _, f := range open {
			if f.PlannedResolveChapter <= 0 {
				continue
			}
			overdue := chapter - f.PlannedResolveChapter
			if overdue <= 0 {
				continue
			}
			text := fmt.Sprintf("伏笔「%s」自第%d章埋设，计划第%d章前回收，当前已超期 %d 章",
				f.Description, f.PlantedChapter, f.PlannedResolveChapter, overdue)
			warnings = append(warnings, text)
			if overdue >= bookAgentForeshadowGrace {
				r.recordIssueText(text)
			}
		}
	}
	for name, pack := range r.decisionPacks {
		decision, ok := parseCharacterDecision(pack)
		if !ok {
			continue
		}
		for _, change := range decision.Changes {
			if strings.TrimSpace(change.TriggerEvent) == "" {
				warnings = append(warnings, fmt.Sprintf(
					"角色「%s」的%s变化缺少触发事件，必须确认是否可成立", name, change.Field))
			}
		}
	}
	if len(warnings) == 0 {
		return "暂无预警。"
	}
	return strings.Join(warnings, "\n")
}

// ──────────────────── 定稿写回 ────────────────────

// finalizeCurrentChapter 只在 Guard 通过后调用：把定稿版本写回台账。
func (r *bookAgentRun) finalizeCurrentChapter() {
	if r == nil || r.chapterFinalized {
		return
	}
	draft := r.currentDraft()
	if strings.TrimSpace(draft) == "" {
		return
	}
	if err := r.writeBackLedger(draft); err != nil {
		log.Printf("BookAgent 台账写回失败: %v", err)
		r.recordIssueText("台账写回失败: " + err.Error())
	}
	r.chapterFinalized = true
}

func (r *bookAgentRun) writeBackLedger(draft string) error {
	chapter := r.chapterNumber()
	ch := r.currentChapter()
	narrativeTime := ch.NarrativeTime
	if narrativeTime == "" {
		narrativeTime = fmt.Sprintf("第%d章", chapter)
	}

	characterIDs := []string{}
	seen := map[string]bool{}
	for _, name := range trimList(ch.Characters) {
		if c, _ := db.GetStoryCharacterByName(r.bookID, name); c != nil && !seen[c.ID] {
			seen[c.ID] = true
			characterIDs = append(characterIDs, c.ID)
		}
	}
	for _, id := range r.chapterBitPlayers {
		if !seen[id] {
			seen[id] = true
			characterIDs = append(characterIDs, id)
		}
	}

	locationID := ""
	for _, name := range splitLocations(ch.Location) {
		if loc, _ := db.GetStoryLocationByName(r.bookID, name); loc != nil {
			locationID = loc.ID
			break
		}
	}

	event, err := db.CreateStoryEvent(&db.StoryEvent{
		BookID:        r.bookID,
		Chapter:       chapter,
		NarrativeTime: narrativeTime,
		Summary:       ch.Summary,
		CharacterIDs:  characterIDs,
		LocationID:    locationID,
		StateDelta:    fmt.Sprintf(`{"wordCount":%d}`, jsLen(draft)),
	})
	if err != nil {
		return err
	}
	eventID := ""
	if event != nil {
		eventID = event.ID
	}

	for name, pack := range r.decisionPacks {
		decision, ok := parseCharacterDecision(pack)
		if !ok {
			continue
		}
		c, _ := db.GetStoryCharacterByName(r.bookID, name)
		if c == nil {
			continue
		}
		for _, change := range decision.Changes {
			if strings.TrimSpace(change.Field) == "" {
				continue
			}
			trigger := strings.TrimSpace(change.TriggerEvent)
			if trigger == "" {
				// 章节本身即是一次已发生事件，作为兜底触发来源。
				trigger = eventID
			}
			if _, err := db.AppendCharacterEvent(&db.CharacterEvent{
				BookID:         r.bookID,
				CharacterID:    c.ID,
				Chapter:        chapter,
				NarrativeTime:  narrativeTime,
				TriggerEventID: trigger,
				Field:          change.Field,
				OldValue:       change.OldValue,
				NewValue:       change.NewValue,
				Reason:         change.Reason,
			}); err != nil {
				log.Printf("BookAgent 写入角色事件失败: %v", err)
			}
		}
	}

	// 功能槽位配角在本章按设定退场，写入死亡事件。
	for _, id := range r.chapterBitPlayers {
		c, err := db.GetStoryCharacterByID(id)
		if err != nil || c == nil {
			continue
		}
		_, _ = db.AppendCharacterEvent(&db.CharacterEvent{
			BookID:         r.bookID,
			CharacterID:    c.ID,
			Chapter:        chapter,
			NarrativeTime:  narrativeTime,
			TriggerEventID: eventID,
			Field:          "状态",
			OldValue:       c.Status,
			NewValue:       "死亡",
			Reason:         "按功能槽位在本章退场",
		})
	}

	if locationID != "" {
		if _, err := db.AppendLocationEvent(&db.LocationEvent{
			BookID:         r.bookID,
			LocationID:     locationID,
			Chapter:        chapter,
			NarrativeTime:  narrativeTime,
			TriggerEventID: eventID,
			State:          ch.Summary,
			Reason:         "本章情节推进",
		}); err != nil {
			log.Printf("BookAgent 写入地点事件失败: %v", err)
		}
	}

	if strings.TrimSpace(ch.Foreshadow) != "" {
		if _, err := db.CreateForeshadow(&db.Foreshadow{
			BookID:                r.bookID,
			Description:           ch.Foreshadow,
			PlantedChapter:        chapter,
			PlannedResolveChapter: chapter + 3,
			Status:                db.ForeshadowStatusOpen,
		}); err != nil {
			log.Printf("BookAgent 记录伏笔失败: %v", err)
		}
	}
	if strings.TrimSpace(ch.ResolveForeshadow) != "" {
		if _, err := db.ResolveForeshadowByDescription(r.bookID, ch.ResolveForeshadow, chapter); err != nil {
			log.Printf("BookAgent 回收伏笔失败: %v", err)
		}
	}

	if err := db.SetStoryClock(r.bookID, chapter, narrativeTime); err != nil {
		return err
	}
	if r.sse != nil {
		r.sse.Write("message", fmt.Sprintf("\n[台账] 第%d章已定稿写回：事件、角色变化、地点状态与伏笔已更新\n", chapter))
	}
	return nil
}

// ──────────────────── 调度摘要 ────────────────────

func (r *bookAgentRun) orchestratorState() string {
	chapter := r.chapterNumber()
	ch := r.currentChapter()
	draft := r.currentDraft()

	var sb strings.Builder
	fmt.Fprintf(&sb, "## 当前状态\n\n")
	fmt.Fprintf(&sb, "- 章节进度：已完成 %d/%d 章\n", r.completedChapters, len(r.outlineChapters))
	fmt.Fprintf(&sb, "- 当前章节：第%d章《%s》\n", chapter, ch.Title)
	fmt.Fprintf(&sb, "- 角色决策：已收集 %d 个，待处理 %d 个\n", len(r.decisionPacks), len(r.castQueue))
	if draft == "" {
		sb.WriteString("- 本章正文：未产出\n")
	} else {
		sb.WriteString("- 本章正文：已产出\n")
	}
	if r.lastVerdict != "" {
		fmt.Fprintf(&sb, "- 最近 Guard 结论：%s\n", r.lastVerdict)
	}
	sb.WriteString("\n## 下一步建议\n")
	sb.WriteString(r.orchestratorHint())
	return sb.String()
}

func (r *bookAgentRun) orchestratorHint() string {
	switch {
	case len(r.outlineChapters) == 0:
		return "尚未冻结全书章位：route({ \"target\": \"architect\" })。"
	case !r.hasMoreChapters():
		return "全部章节已完成：route({ \"target\": \"end\" })。"
	case r.currentDraft() == "":
		if !r.castPrepared || len(r.castQueue) > 0 {
			return "本章角色决策尚未齐备：route({ \"target\": \"character\" })。"
		}
		return "角色决策已齐：route({ \"target\": \"writer\" }) 渲染正文。"
	default:
		return "本章正文已产出：route({ \"target\": \"guard\" }) 校验一致性。"
	}
}

func containsString(items []string, target string) bool {
	for _, item := range items {
		if item == target {
			return true
		}
	}
	return false
}
