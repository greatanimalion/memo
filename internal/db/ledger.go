package db

import (
	"database/sql"
	"encoding/json"
	"strings"
	"time"
)

// 结构化台账（Ledger）是长篇写作的记忆层：
//   - 角色/地点只存基础档案，变化以事件流追加，当前状态由事件投影得到；
//   - 事件表带叙事章节与叙事时间，供按角色/章节/地点做索引检索；
//   - storyClock 保存当前叙事时间指针；
//   - foreshadows 记录伏笔的埋设与回收计划。
// 草稿不写台账，只有定稿版本才通过 Append* 写入。

const (
	CharacterImportanceMain    = "main"
	CharacterImportanceSupport = "support"
	CharacterImportanceBit     = "bit"

	ForeshadowStatusOpen     = "open"
	ForeshadowStatusResolved = "resolved"
)

// StoryCharacter 是角色基础档案。性格、外表等会变化的字段不存于此，
// 而是记录在 characterEvents 中。
type StoryCharacter struct {
	ID           string
	BookID       string
	Name         string
	Importance   string
	Profile      string
	Status       string
	FirstChapter int
	LastChapter  int
	CreatedAt    int64
	UpdatedAt    int64
}

// CharacterEvent 是一次角色状态变化事件（事件溯源的最小单元）。
type CharacterEvent struct {
	ID             string
	BookID         string
	CharacterID    string
	Chapter        int
	NarrativeTime  string
	TriggerEventID string
	Field          string
	OldValue       string
	NewValue       string
	Reason         string
	CreatedAt      int64
}

// StoryEvent 是一个已发生的叙事事件。
type StoryEvent struct {
	ID            string
	BookID        string
	Chapter       int
	NarrativeTime string
	Summary       string
	CharacterIDs  []string
	LocationID    string
	CauseEventID  string
	StateDelta    string
	CreatedAt     int64
}

// StoryLocation 是地点基础档案。
type StoryLocation struct {
	ID        string
	BookID    string
	Name      string
	Profile   string
	CreatedAt int64
	UpdatedAt int64
}

// LocationEvent 是一次地点状态变化事件。
type LocationEvent struct {
	ID             string
	BookID         string
	LocationID     string
	Chapter        int
	NarrativeTime  string
	TriggerEventID string
	State          string
	Reason         string
	CreatedAt      int64
}

// Foreshadow 是伏笔的埋设与回收计划。
type Foreshadow struct {
	ID                    string
	BookID                string
	Description           string
	PlantedChapter        int
	PlannedResolveChapter int
	ResolvedChapter       int
	Status                string
	CreatedAt             int64
	UpdatedAt             int64
}

// StoryClock 是时间总线上的当前叙事时间指针。
type StoryClock struct {
	BookID         string
	CurrentChapter int
	NarrativeTime  string
	UpdatedAt      int64
}

// CharacterProjection 是由事件流投影出的角色当前状态。
type CharacterProjection struct {
	Character *StoryCharacter
	Fields    map[string]string
	Events    []CharacterEvent
}

// LocationProjection 是由事件流投影出的地点当前状态。
type LocationProjection struct {
	Location *StoryLocation
	State    string
	Events   []LocationEvent
}

// ──────────────────── 角色 ────────────────────

const storyCharacterColumns = "id, bookId, name, importance, profile, status, firstChapter, lastChapter, createdAt, updatedAt"

func scanStoryCharacter(row rowScanner) (*StoryCharacter, error) {
	c := &StoryCharacter{}
	var importance, profile, status sql.NullString
	var first, last, created, updated sql.NullInt64
	if err := row.Scan(&c.ID, &c.BookID, &c.Name, &importance, &profile, &status, &first, &last, &created, &updated); err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	c.Importance = importance.String
	if c.Importance == "" {
		c.Importance = CharacterImportanceSupport
	}
	c.Profile = profile.String
	c.Status = status.String
	if c.Status == "" {
		c.Status = "alive"
	}
	c.FirstChapter = int(first.Int64)
	c.LastChapter = int(last.Int64)
	c.CreatedAt = created.Int64
	c.UpdatedAt = updated.Int64
	return c, nil
}

func GetStoryCharacterByID(id string) (*StoryCharacter, error) {
	return scanStoryCharacter(DB().QueryRow(
		"SELECT "+storyCharacterColumns+" FROM storyCharacters WHERE id = ?", id))
}

func GetStoryCharacterByName(bookID, name string) (*StoryCharacter, error) {
	return scanStoryCharacter(DB().QueryRow(
		"SELECT "+storyCharacterColumns+" FROM storyCharacters WHERE bookId = ? AND name = ?", bookID, name))
}

func ListStoryCharacters(bookID string) ([]StoryCharacter, error) {
	rows, err := DB().Query(
		"SELECT "+storyCharacterColumns+" FROM storyCharacters WHERE bookId = ? ORDER BY firstChapter ASC, name ASC", bookID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []StoryCharacter{}
	for rows.Next() {
		c, err := scanStoryCharacter(rows)
		if err != nil {
			return nil, err
		}
		if c != nil {
			out = append(out, *c)
		}
	}
	return out, rows.Err()
}

// UpsertStoryCharacter 按 (bookId, name) 创建或更新角色基础档案。
func UpsertStoryCharacter(c *StoryCharacter) (*StoryCharacter, error) {
	if c == nil || strings.TrimSpace(c.Name) == "" {
		return nil, nil
	}
	now := time.Now().UnixMilli()
	existing, err := GetStoryCharacterByName(c.BookID, c.Name)
	if err != nil {
		return nil, err
	}
	if existing != nil {
		updates := map[string]any{"updatedAt": now}
		if c.Importance != "" {
			updates["importance"] = c.Importance
		}
		if c.Profile != "" {
			updates["profile"] = c.Profile
		}
		if c.Status != "" {
			updates["status"] = c.Status
		}
		if c.FirstChapter > 0 && existing.FirstChapter == 0 {
			updates["firstChapter"] = c.FirstChapter
		}
		if c.LastChapter > existing.LastChapter {
			updates["lastChapter"] = c.LastChapter
		}
		fields, args := buildUpdate(updates)
		args = append(args, existing.ID)
		if _, err := DB().Exec("UPDATE storyCharacters SET "+joinFields(fields)+" WHERE id = ?", args...); err != nil {
			return nil, err
		}
		return GetStoryCharacterByID(existing.ID)
	}

	if c.ID == "" {
		c.ID = NewID()
	}
	if c.Importance == "" {
		c.Importance = CharacterImportanceSupport
	}
	if c.Status == "" {
		c.Status = "alive"
	}
	if c.CreatedAt == 0 {
		c.CreatedAt = now
	}
	c.UpdatedAt = now
	if _, err := DB().Exec(
		"INSERT INTO storyCharacters ("+storyCharacterColumns+") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
		c.ID, c.BookID, c.Name, c.Importance, c.Profile, c.Status,
		c.FirstChapter, c.LastChapter, c.CreatedAt, c.UpdatedAt,
	); err != nil {
		return nil, err
	}
	return GetStoryCharacterByID(c.ID)
}

// AppendCharacterEvent 追加一条角色变化事件，并同步角色的最后出现章节/状态。
func AppendCharacterEvent(e *CharacterEvent) (*CharacterEvent, error) {
	if e == nil || e.CharacterID == "" || e.Field == "" {
		return nil, nil
	}
	if e.ID == "" {
		e.ID = NewID()
	}
	if e.CreatedAt == 0 {
		e.CreatedAt = time.Now().UnixMilli()
	}
	if _, err := DB().Exec(
		"INSERT INTO characterEvents (id, bookId, characterId, chapter, narrativeTime, triggerEventId, field, oldValue, newValue, reason, createdAt) "+
			"VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
		e.ID, e.BookID, e.CharacterID, e.Chapter, e.NarrativeTime, e.TriggerEventID,
		e.Field, e.OldValue, e.NewValue, e.Reason, e.CreatedAt,
	); err != nil {
		return nil, err
	}
	updates := map[string]any{"lastChapter": e.Chapter, "updatedAt": e.CreatedAt}
	if e.Field == "状态" && e.NewValue != "" {
		updates["status"] = e.NewValue
	}
	fields, args := buildUpdate(updates)
	args = append(args, e.CharacterID)
	if _, err := DB().Exec("UPDATE storyCharacters SET "+joinFields(fields)+" WHERE id = ?", args...); err != nil {
		return nil, err
	}
	return e, nil
}

// ListCharacterEvents 返回角色的变化事件（按章节/时间正序）。
// uptoChapter <= 0 表示不限章节。
func ListCharacterEvents(characterID string, uptoChapter int) ([]CharacterEvent, error) {
	query := "SELECT id, bookId, characterId, chapter, narrativeTime, triggerEventId, field, oldValue, newValue, reason, createdAt " +
		"FROM characterEvents WHERE characterId = ?"
	args := []any{characterID}
	if uptoChapter > 0 {
		query += " AND chapter <= ?"
		args = append(args, uptoChapter)
	}
	query += " ORDER BY chapter ASC, createdAt ASC"
	rows, err := DB().Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []CharacterEvent{}
	for rows.Next() {
		var e CharacterEvent
		var narrativeTime, trigger, field, oldValue, newValue, reason sql.NullString
		if err := rows.Scan(&e.ID, &e.BookID, &e.CharacterID, &e.Chapter, &narrativeTime, &trigger,
			&field, &oldValue, &newValue, &reason, &e.CreatedAt); err != nil {
			return nil, err
		}
		e.NarrativeTime = narrativeTime.String
		e.TriggerEventID = trigger.String
		e.Field = field.String
		e.OldValue = oldValue.String
		e.NewValue = newValue.String
		e.Reason = reason.String
		out = append(out, e)
	}
	return out, rows.Err()
}

// ProjectCharacterState 由基础档案 + 截至 uptoChapter 的事件流投影当前状态。
func ProjectCharacterState(characterID string, uptoChapter int) (*CharacterProjection, error) {
	c, err := GetStoryCharacterByID(characterID)
	if err != nil || c == nil {
		return nil, err
	}
	events, err := ListCharacterEvents(characterID, uptoChapter)
	if err != nil {
		return nil, err
	}
	fields := map[string]string{}
	for _, e := range events {
		if e.Field == "" {
			continue
		}
		fields[e.Field] = e.NewValue
	}
	return &CharacterProjection{Character: c, Fields: fields, Events: events}, nil
}

// ──────────────────── 事件 ────────────────────

func CreateStoryEvent(e *StoryEvent) (*StoryEvent, error) {
	if e == nil {
		return nil, nil
	}
	if e.ID == "" {
		e.ID = NewID()
	}
	if e.CreatedAt == 0 {
		e.CreatedAt = time.Now().UnixMilli()
	}
	if e.CharacterIDs == nil {
		e.CharacterIDs = []string{}
	}
	if e.StateDelta == "" {
		e.StateDelta = "{}"
	}
	ids, _ := json.Marshal(e.CharacterIDs)
	if _, err := DB().Exec(
		"INSERT INTO storyEvents (id, bookId, chapter, narrativeTime, summary, characterIds, locationId, causeEventId, stateDelta, createdAt) "+
			"VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
		e.ID, e.BookID, e.Chapter, e.NarrativeTime, e.Summary, string(ids),
		e.LocationID, e.CauseEventID, e.StateDelta, e.CreatedAt,
	); err != nil {
		return nil, err
	}
	return e, nil
}

// ListStoryEvents 返回章节区间内的事件（按叙事章节排序）。toChapter <= 0 表示不限上限。
func ListStoryEvents(bookID string, fromChapter, toChapter int) ([]StoryEvent, error) {
	query := "SELECT id, bookId, chapter, narrativeTime, summary, characterIds, locationId, causeEventId, stateDelta, createdAt " +
		"FROM storyEvents WHERE bookId = ?"
	args := []any{bookID}
	if fromChapter > 0 {
		query += " AND chapter >= ?"
		args = append(args, fromChapter)
	}
	if toChapter > 0 {
		query += " AND chapter <= ?"
		args = append(args, toChapter)
	}
	query += " ORDER BY chapter ASC, createdAt ASC"
	rows, err := DB().Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []StoryEvent{}
	for rows.Next() {
		e, err := scanStoryEvent(rows)
		if err != nil {
			return nil, err
		}
		if e != nil {
			out = append(out, *e)
		}
	}
	return out, rows.Err()
}

func scanStoryEvent(row rowScanner) (*StoryEvent, error) {
	e := &StoryEvent{}
	var narrativeTime, summary, ids, location, cause, delta sql.NullString
	if err := row.Scan(&e.ID, &e.BookID, &e.Chapter, &narrativeTime, &summary, &ids,
		&location, &cause, &delta, &e.CreatedAt); err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	e.NarrativeTime = narrativeTime.String
	e.Summary = summary.String
	e.LocationID = location.String
	e.CauseEventID = cause.String
	e.StateDelta = delta.String
	if strings.TrimSpace(ids.String) != "" {
		_ = json.Unmarshal([]byte(ids.String), &e.CharacterIDs)
	}
	return e, nil
}

// ──────────────────── 地点 ────────────────────

const storyLocationColumns = "id, bookId, name, profile, createdAt, updatedAt"

func scanStoryLocation(row rowScanner) (*StoryLocation, error) {
	l := &StoryLocation{}
	var profile sql.NullString
	if err := row.Scan(&l.ID, &l.BookID, &l.Name, &profile, &l.CreatedAt, &l.UpdatedAt); err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	l.Profile = profile.String
	return l, nil
}

func GetStoryLocationByName(bookID, name string) (*StoryLocation, error) {
	return scanStoryLocation(DB().QueryRow(
		"SELECT "+storyLocationColumns+" FROM storyLocations WHERE bookId = ? AND name = ?", bookID, name))
}

func ListStoryLocations(bookID string) ([]StoryLocation, error) {
	rows, err := DB().Query("SELECT "+storyLocationColumns+" FROM storyLocations WHERE bookId = ? ORDER BY name ASC", bookID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []StoryLocation{}
	for rows.Next() {
		l, err := scanStoryLocation(rows)
		if err != nil {
			return nil, err
		}
		if l != nil {
			out = append(out, *l)
		}
	}
	return out, rows.Err()
}

func UpsertStoryLocation(l *StoryLocation) (*StoryLocation, error) {
	if l == nil || strings.TrimSpace(l.Name) == "" {
		return nil, nil
	}
	now := time.Now().UnixMilli()
	existing, err := GetStoryLocationByName(l.BookID, l.Name)
	if err != nil {
		return nil, err
	}
	if existing != nil {
		if l.Profile != "" {
			if _, err := DB().Exec("UPDATE storyLocations SET profile = ?, updatedAt = ? WHERE id = ?",
				l.Profile, now, existing.ID); err != nil {
				return nil, err
			}
		}
		return GetStoryLocationByName(l.BookID, l.Name)
	}
	if l.ID == "" {
		l.ID = NewID()
	}
	if l.CreatedAt == 0 {
		l.CreatedAt = now
	}
	l.UpdatedAt = now
	if _, err := DB().Exec(
		"INSERT INTO storyLocations ("+storyLocationColumns+") VALUES (?, ?, ?, ?, ?, ?)",
		l.ID, l.BookID, l.Name, l.Profile, l.CreatedAt, l.UpdatedAt,
	); err != nil {
		return nil, err
	}
	return GetStoryLocationByName(l.BookID, l.Name)
}

func AppendLocationEvent(e *LocationEvent) (*LocationEvent, error) {
	if e == nil || e.LocationID == "" {
		return nil, nil
	}
	if e.ID == "" {
		e.ID = NewID()
	}
	if e.CreatedAt == 0 {
		e.CreatedAt = time.Now().UnixMilli()
	}
	if _, err := DB().Exec(
		"INSERT INTO locationEvents (id, bookId, locationId, chapter, narrativeTime, triggerEventId, state, reason, createdAt) "+
			"VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
		e.ID, e.BookID, e.LocationID, e.Chapter, e.NarrativeTime, e.TriggerEventID, e.State, e.Reason, e.CreatedAt,
	); err != nil {
		return nil, err
	}
	return e, nil
}

func ListLocationEvents(locationID string, uptoChapter int) ([]LocationEvent, error) {
	query := "SELECT id, bookId, locationId, chapter, narrativeTime, triggerEventId, state, reason, createdAt " +
		"FROM locationEvents WHERE locationId = ?"
	args := []any{locationID}
	if uptoChapter > 0 {
		query += " AND chapter <= ?"
		args = append(args, uptoChapter)
	}
	query += " ORDER BY chapter ASC, createdAt ASC"
	rows, err := DB().Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []LocationEvent{}
	for rows.Next() {
		var e LocationEvent
		var narrativeTime, trigger, state, reason sql.NullString
		if err := rows.Scan(&e.ID, &e.BookID, &e.LocationID, &e.Chapter, &narrativeTime, &trigger,
			&state, &reason, &e.CreatedAt); err != nil {
			return nil, err
		}
		e.NarrativeTime = narrativeTime.String
		e.TriggerEventID = trigger.String
		e.State = state.String
		e.Reason = reason.String
		out = append(out, e)
	}
	return out, rows.Err()
}

func ProjectLocationState(locationID string, uptoChapter int) (*LocationProjection, error) {
	l, err := scanStoryLocation(DB().QueryRow(
		"SELECT "+storyLocationColumns+" FROM storyLocations WHERE id = ?", locationID))
	if err != nil || l == nil {
		return nil, err
	}
	events, err := ListLocationEvents(locationID, uptoChapter)
	if err != nil {
		return nil, err
	}
	state := ""
	for _, e := range events {
		if strings.TrimSpace(e.State) != "" {
			state = e.State
		}
	}
	return &LocationProjection{Location: l, State: state, Events: events}, nil
}

// ──────────────────── 伏笔 ────────────────────

const foreshadowColumns = "id, bookId, description, plantedChapter, plannedResolveChapter, resolvedChapter, status, createdAt, updatedAt"

func scanForeshadow(row rowScanner) (*Foreshadow, error) {
	f := &Foreshadow{}
	var description, status sql.NullString
	if err := row.Scan(&f.ID, &f.BookID, &description, &f.PlantedChapter,
		&f.PlannedResolveChapter, &f.ResolvedChapter, &status, &f.CreatedAt, &f.UpdatedAt); err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	f.Description = description.String
	f.Status = status.String
	if f.Status == "" {
		f.Status = ForeshadowStatusOpen
	}
	return f, nil
}

func CreateForeshadow(f *Foreshadow) (*Foreshadow, error) {
	if f == nil || strings.TrimSpace(f.Description) == "" {
		return nil, nil
	}
	now := time.Now().UnixMilli()
	if f.ID == "" {
		f.ID = NewID()
	}
	if f.Status == "" {
		f.Status = ForeshadowStatusOpen
	}
	if f.CreatedAt == 0 {
		f.CreatedAt = now
	}
	f.UpdatedAt = now
	if _, err := DB().Exec(
		"INSERT INTO foreshadows ("+foreshadowColumns+") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
		f.ID, f.BookID, f.Description, f.PlantedChapter, f.PlannedResolveChapter,
		f.ResolvedChapter, f.Status, f.CreatedAt, f.UpdatedAt,
	); err != nil {
		return nil, err
	}
	return f, nil
}

func ListForeshadows(bookID string) ([]Foreshadow, error) {
	rows, err := DB().Query("SELECT "+foreshadowColumns+" FROM foreshadows WHERE bookId = ? ORDER BY plantedChapter ASC", bookID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Foreshadow{}
	for rows.Next() {
		f, err := scanForeshadow(rows)
		if err != nil {
			return nil, err
		}
		if f != nil {
			out = append(out, *f)
		}
	}
	return out, rows.Err()
}

func ListOpenForeshadows(bookID string) ([]Foreshadow, error) {
	rows, err := DB().Query(
		"SELECT "+foreshadowColumns+" FROM foreshadows WHERE bookId = ? AND status = ? ORDER BY plannedResolveChapter ASC",
		bookID, ForeshadowStatusOpen)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Foreshadow{}
	for rows.Next() {
		f, err := scanForeshadow(rows)
		if err != nil {
			return nil, err
		}
		if f != nil {
			out = append(out, *f)
		}
	}
	return out, rows.Err()
}

// ResolveForeshadowByDescription 按描述匹配并回收一条未回收伏笔。
// 先精确匹配，再退化为包含匹配。
func ResolveForeshadowByDescription(bookID, description string, chapter int) (bool, error) {
	description = strings.TrimSpace(description)
	if description == "" {
		return false, nil
	}
	open, err := ListOpenForeshadows(bookID)
	if err != nil {
		return false, err
	}
	var match *Foreshadow
	for i := range open {
		if strings.TrimSpace(open[i].Description) == description {
			match = &open[i]
			break
		}
	}
	if match == nil {
		for i := range open {
			a := strings.TrimSpace(open[i].Description)
			if strings.Contains(a, description) || strings.Contains(description, a) {
				match = &open[i]
				break
			}
		}
	}
	if match == nil {
		return false, nil
	}
	if _, err := DB().Exec(
		"UPDATE foreshadows SET status = ?, resolvedChapter = ?, updatedAt = ? WHERE id = ?",
		ForeshadowStatusResolved, chapter, time.Now().UnixMilli(), match.ID,
	); err != nil {
		return false, err
	}
	return true, nil
}

// ──────────────────── 时间总线 ────────────────────

func GetStoryClock(bookID string) (*StoryClock, error) {
	c := &StoryClock{}
	var narrativeTime sql.NullString
	var updated sql.NullInt64
	err := DB().QueryRow(
		"SELECT bookId, currentChapter, narrativeTime, updatedAt FROM storyClock WHERE bookId = ?", bookID,
	).Scan(&c.BookID, &c.CurrentChapter, &narrativeTime, &updated)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	c.NarrativeTime = narrativeTime.String
	c.UpdatedAt = updated.Int64
	return c, nil
}

// SetStoryClock 推进叙事时间指针。
func SetStoryClock(bookID string, chapter int, narrativeTime string) error {
	now := time.Now().UnixMilli()
	_, err := DB().Exec(
		"INSERT INTO storyClock (bookId, currentChapter, narrativeTime, updatedAt) VALUES (?, ?, ?, ?) "+
			"ON CONFLICT(bookId) DO UPDATE SET currentChapter = excluded.currentChapter, "+
			"narrativeTime = excluded.narrativeTime, updatedAt = excluded.updatedAt",
		bookID, chapter, narrativeTime, now)
	return err
}
