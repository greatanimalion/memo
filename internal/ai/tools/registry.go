package tools

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"reflect"
	"sort"
	"strings"
	"time"

	"memo/internal/ai/llm"
)

// 工具统一编排层。
//
// 这里对齐 phero 的 llm.Tool 模式：每个工具是「名称 + 描述 + Input 结构体
// （靠字段 tag 反射出 JSON Schema）+ 执行函数」构成的 Tool，集中注册到
// Registry，由注册表统一负责：
//   * 生成下发给模型的 OpenAI function 工具声明；
//   * 统一分发执行（聊天工具与写书工具共用同一套入口）；
//   * 用 Exclusive 标记需要串行执行的工具（例如写章节）；
//   * 用 Middleware 在不侵入各工具实现的前提下加入横切逻辑。

// Handler 是 Tool 的底层执行函数：arguments 是模型给出的原始 JSON 参数，
// 与 phero 的 llm.ToolHandler 保持一致。
type Handler func(ctx context.Context, arguments string) (any, error)

// Middleware 包装工具执行函数，用于校验、鉴权、日志等横切逻辑。
// 执行顺序与添加顺序一致：Use(m1, m2) 时 m1 先于 m2 执行。
type Middleware func(tool *Tool, next Handler) Handler

// ErrToolNameRequired 由 NewTool / NewRawTool 在工具名为空时返回。
var ErrToolNameRequired = errors.New("tool name is required")

// Tool 是一个可被模型调用的工具（对应 phero 的 llm.Tool）。
type Tool struct {
	// name 是展示给模型的稳定工具名。
	name string
	// description 是展示给模型的工具说明。
	description string
	// inputSchema 是按结构体反射或直接给定的参数 schema（可选字段保持可选）。
	inputSchema map[string]any
	// strictInputSchema 是 inputSchema 的严格形式（所有字段必填、禁止额外字段）。
	strictInputSchema map[string]any
	// strict 决定 InputSchema 返回严格形式还是原始形式。
	strict bool
	// handle 是底层执行函数。
	handle Handler
	// middlewares 按添加顺序包装 handle。
	middlewares []Middleware
	// exclusive 表示该工具的调用不能与其他调用重叠。
	exclusive bool
}

// Name 返回工具名。
func (t *Tool) Name() string { return t.name }

// Description 返回工具说明。
func (t *Tool) Description() string { return t.description }

// Schema 返回指定形式的参数 schema：strict 为 true 时返回严格形式。
func (t *Tool) Schema(strict bool) map[string]any {
	if strict && t.strictInputSchema != nil {
		return t.strictInputSchema
	}
	return t.inputSchema
}

// InputSchema 返回该工具自己选定的参数 schema。
func (t *Tool) InputSchema() map[string]any { return t.Schema(t.strict) }

// SetStrict 选择下发给模型的 schema 形式。
//
// 默认沿用原始形式（omitempty 字段保持可选），因为本项目对接的
// OpenAI 兼容服务端普遍接受非严格 schema；需要 OpenAI/Anthropic
// 严格工具模式时可显式开启。
func (t *Tool) SetStrict(strict bool) *Tool {
	t.strict = strict
	return t
}

// Strict 报告工具是否使用严格 schema。
func (t *Tool) Strict() bool { return t.strict }

// SetExclusive 标记该工具为独占：同一轮模型返回多个工具调用时，
// 该工具的调用单独执行，不与其它调用并发。适用于共享可变状态的工具，
// 例如写同一本书的章节。
func (t *Tool) SetExclusive(exclusive bool) *Tool {
	t.exclusive = exclusive
	return t
}

// Exclusive 报告工具是否为独占。
func (t *Tool) Exclusive() bool { return t.exclusive }

// Use 追加中间件，按添加顺序执行。
func (t *Tool) Use(middlewares ...Middleware) *Tool {
	t.middlewares = append(t.middlewares, middlewares...)
	return t
}

// Handle 执行一次工具调用，原始 JSON 参数原样交给底层函数。
func (t *Tool) Handle(ctx context.Context, arguments string) (any, error) {
	handler := t.handle
	for i := len(t.middlewares) - 1; i >= 0; i-- {
		handler = t.middlewares[i](t, handler)
	}
	return handler(ctx, arguments)
}

// NewTool 用泛型处理器创建工具（对应 phero 的 llm.NewTool）。
//
// handler 形如 func(context.Context, T) (R, error)：T 用于反射生成参数
// schema，模型给出的 JSON 参数会被解析成 T 后传给 handler；R 是工具结果。
func NewTool[T, R any](name, description string, handler func(ctx context.Context, args T) (R, error)) (*Tool, error) {
	if name == "" {
		return nil, ErrToolNameRequired
	}
	var zero T
	if reflect.TypeOf(zero) == nil {
		return nil, fmt.Errorf("failed to infer tool input type for %q: type parameter has nil zero value", name)
	}
	schema := SchemaOf(zero)
	return &Tool{
		name:              name,
		description:       description,
		inputSchema:       schema,
		strictInputSchema: strictSchema(schema),
		handle: func(ctx context.Context, arguments string) (any, error) {
			var args T
			if strings.TrimSpace(arguments) != "" {
				if err := json.Unmarshal([]byte(arguments), &args); err != nil {
					return nil, fmt.Errorf("failed to parse arguments: %w", err)
				}
			}
			return handler(ctx, args)
		},
	}, nil
}

// NewRawTool 用外部给定的 JSON Schema 与原始参数处理器创建工具
// （对应 phero 的 llm.NewRawTool），用于 schema 无法由 Go 类型反射得到的场景。
func NewRawTool(name, description string, inputSchema map[string]any, handler Handler) (*Tool, error) {
	if name == "" {
		return nil, ErrToolNameRequired
	}
	if inputSchema == nil {
		inputSchema = map[string]any{"type": "object", "properties": map[string]any{}}
	}
	schema := cloneSchema(inputSchema)
	return &Tool{
		name:              name,
		description:       description,
		inputSchema:       schema,
		strictInputSchema: strictSchema(schema),
		handle:            handler,
	}, nil
}

// Must 在 err 非空时 panic，便于把必然成功的工具声明写成表达式。
func Must(tool *Tool, err error) *Tool {
	if err != nil {
		panic(err)
	}
	return tool
}

// Registry 是按注册顺序保存的工具集合。
type Registry struct {
	order []string
	tools map[string]*Tool
}

// New 按传入顺序注册工具；重名时保留首次注册的声明。
func New(toolList ...*Tool) *Registry {
	reg := &Registry{tools: make(map[string]*Tool, len(toolList))}
	for _, tool := range toolList {
		if tool == nil || tool.name == "" {
			continue
		}
		if _, exists := reg.tools[tool.name]; exists {
			continue
		}
		reg.tools[tool.name] = tool
		reg.order = append(reg.order, tool.name)
	}
	return reg
}

// Get 返回指定工具。
func (r *Registry) Get(name string) (*Tool, bool) {
	tool, ok := r.tools[name]
	return tool, ok
}

// Tools 返回全部工具（保持注册顺序）。
func (r *Registry) Tools() []*Tool {
	out := make([]*Tool, 0, len(r.order))
	for _, name := range r.order {
		out = append(out, r.tools[name])
	}
	return out
}

// Declarations 返回全部工具声明（保持注册顺序，保证请求体稳定）。
func (r *Registry) Declarations() []llm.Tool {
	out := make([]llm.Tool, 0, len(r.order))
	for _, name := range r.order {
		tool := r.tools[name]
		out = append(out, llm.FuncTool(tool.Name(), tool.Description(), tool.InputSchema()))
	}
	return out
}

// ExecuteRaw 以原始 JSON 参数执行一次工具调用。
func (r *Registry) ExecuteRaw(ctx context.Context, name, arguments string) (string, error) {
	tool, ok := r.tools[name]
	if !ok {
		return "", fmt.Errorf("Tool %q not found.", name)
	}
	result, err := tool.Handle(ctx, arguments)
	if err != nil {
		return "", err
	}
	return stringifyResult(result)
}

// Execute 以已解析的参数执行一次工具调用。
func (r *Registry) Execute(ctx context.Context, name string, args map[string]any) (string, error) {
	raw := "{}"
	if len(args) > 0 {
		encoded, err := json.Marshal(args)
		if err != nil {
			return "", err
		}
		raw = string(encoded)
	}
	return r.ExecuteRaw(ctx, name, raw)
}

// stringifyResult 把工具返回值转换为文本结果。
func stringifyResult(value any) (string, error) {
	switch v := value.(type) {
	case nil:
		return "", nil
	case string:
		return v, nil
	case []byte:
		return string(v), nil
	default:
		raw, err := json.Marshal(v)
		if err != nil {
			return "", err
		}
		return string(raw), nil
	}
}

// ──────────────────── 聊天工具 ────────────────────

// EmptyArgs 是无参数工具的占位 Input。
type EmptyArgs struct{}

// chatTools 是 /api/chat-agent 可用的工具注册表。
var chatTools = New(
	Must(getTimeTool()),
	Must(writeDiaryTool()),
	Must(getMemoryTool()),
	Must(updateMemoryTool()),
)

// ChatTools 返回聊天工具注册表（供 agent 层读取声明与执行）。
func ChatTools() *Registry { return chatTools }

func getTimeTool() (*Tool, error) {
	return NewTool[EmptyArgs]("get_time", "获取当前日期和时间",
		func(_ context.Context, _ EmptyArgs) (string, error) {
			loc, err := time.LoadLocation("Asia/Shanghai")
			if err != nil {
				loc = time.FixedZone("CST", 8*3600)
			}
			return time.Now().In(loc).Format("2006/1/2 15:04:05"), nil
		})
}

// ──────────────────── Input 结构体反射生成 JSON Schema ────────────────────

// SchemaOf 反射 Input 结构体生成 JSON Schema（对应 phero 依据 T 生成 schema 的做法）。
func SchemaOf(v any) map[string]any {
	t := reflect.TypeOf(v)
	for t != nil && t.Kind() == reflect.Ptr {
		t = t.Elem()
	}
	if t == nil {
		return map[string]any{"type": "object", "properties": map[string]any{}}
	}
	return jsonSchemaForType(t)
}

func jsonSchemaForType(t reflect.Type) map[string]any {
	switch t.Kind() {
	case reflect.Bool:
		return map[string]any{"type": "boolean"}
	case reflect.Int, reflect.Int8, reflect.Int16, reflect.Int32, reflect.Int64,
		reflect.Uint, reflect.Uint8, reflect.Uint16, reflect.Uint32, reflect.Uint64:
		return map[string]any{"type": "integer"}
	case reflect.Float32, reflect.Float64:
		return map[string]any{"type": "number"}
	case reflect.Slice, reflect.Array:
		return map[string]any{"type": "array", "items": jsonSchemaForType(t.Elem())}
	case reflect.Map:
		return map[string]any{"type": "object"}
	case reflect.Ptr:
		// 指针字段沿用其指向元素的 schema，指针仅用于区分“未提供”。
		return jsonSchemaForType(t.Elem())
	case reflect.Struct:
		return objectSchemaForType(t)
	default:
		return map[string]any{"type": "string"}
	}
}

func objectSchemaForType(t reflect.Type) map[string]any {
	props := map[string]any{}
	required := make([]string, 0, t.NumField())
	for i := 0; i < t.NumField(); i++ {
		field := t.Field(i)
		if field.PkgPath != "" { // 未导出字段不参与 schema
			continue
		}
		name, omitempty := jsonFieldName(field)
		if name == "" || name == "-" {
			continue
		}
		prop := jsonSchemaForType(field.Type)
		applyFieldTags(prop, field)
		props[name] = prop
		if !omitempty {
			required = append(required, name)
		}
	}
	schema := map[string]any{"type": "object", "properties": props}
	if len(required) > 0 {
		schema["required"] = required
	}
	return schema
}

// jsonFieldName 解析 json tag，返回字段名以及是否 omitempty（可选字段）。
func jsonFieldName(field reflect.StructField) (string, bool) {
	tag := field.Tag.Get("json")
	if tag == "" {
		return field.Name, false
	}
	name, rest, _ := strings.Cut(tag, ",")
	if name == "" {
		name = field.Name
	}
	return name, strings.Contains(rest, "omitempty")
}

// applyFieldTags 把 jsonschema tag（description/enum）以及独立的
// jsonschema_description 写入属性 schema。
func applyFieldTags(prop map[string]any, field reflect.StructField) {
	if desc := field.Tag.Get("jsonschema_description"); desc != "" {
		prop["description"] = desc
	}

	tag, ok := field.Tag.Lookup("jsonschema")
	if !ok {
		return
	}
	var enum []string
	for _, entry := range strings.Split(tag, ",") {
		key, value, _ := strings.Cut(entry, "=")
		switch strings.TrimSpace(key) {
		case "description":
			prop["description"] = value
		case "enum":
			enum = append(enum, value)
		}
	}
	if len(enum) > 0 {
		prop["enum"] = enum
	}
}

// strictSchema 返回 schema 的严格形式：每个 object 的所有属性都必填，
// 并禁止额外属性（对应 phero 的 strict schema 归一化）。
func strictSchema(schema map[string]any) map[string]any {
	if schema == nil {
		return nil
	}
	out := cloneSchema(schema)
	applyStrict(out)
	return out
}

func cloneSchema(schema map[string]any) map[string]any {
	raw, err := json.Marshal(schema)
	if err != nil {
		return schema
	}
	var out map[string]any
	if err := json.Unmarshal(raw, &out); err != nil {
		return schema
	}
	return out
}

func applyStrict(schema map[string]any) {
	switch schema["type"] {
	case "object":
		schema["additionalProperties"] = false
		props, _ := schema["properties"].(map[string]any)
		required := make([]string, 0, len(props))
		for name, raw := range props {
			required = append(required, name)
			if prop, ok := raw.(map[string]any); ok {
				applyStrict(prop)
			}
		}
		sort.Strings(required)
		if len(required) > 0 {
			schema["required"] = required
		}
	case "array":
		if items, ok := schema["items"].(map[string]any); ok {
			applyStrict(items)
		}
	}
}

// ──────────────────── 旧实现（保留备查，不再使用） ────────────────────
//
// 旧的 Spec / Meta / DefineRaw / DefineMap 与 map 版 Registry 已被上面的
// phero 风格 Tool 取代，原定义保留如下：
//
// // Handler 执行一次工具调用。arguments 是模型给出的原始 JSON 参数，
// // 与 phero 的 llm.ToolHandler 保持一致。
// type Handler func(ctx context.Context, arguments string) (string, error)
//
// // Spec 是一个工具的统一声明。
// type Spec struct {
// 	Name        string
// 	Description string
// 	Parameters  map[string]any
// 	// Exclusive 表示同一轮内该工具必须串行执行（会读写共享状态）。
// 	Exclusive bool
// 	Handler   Handler
// }
//
// // Declaration 转换为 OpenAI function 工具声明。
// func (s *Spec) Declaration() llm.Tool {
// 	return llm.FuncTool(s.Name, s.Description, s.Parameters)
// }
//
// // Registry 是按注册顺序保存的工具集合。
// type Registry struct {
// 	order []string
// 	specs map[string]*Spec
// }
//
// // New 按传入顺序注册工具；重名时保留首次注册的声明。
// func New(specs ...*Spec) *Registry {
// 	reg := &Registry{specs: make(map[string]*Spec, len(specs))}
// 	for _, spec := range specs {
// 		if spec == nil || spec.Name == "" {
// 			continue
// 		}
// 		if _, exists := reg.specs[spec.Name]; exists {
// 			continue
// 		}
// 		reg.specs[spec.Name] = spec
// 		reg.order = append(reg.order, spec.Name)
// 	}
// 	return reg
// }
//
// // Get 返回指定工具的声明。
// func (r *Registry) Get(name string) (*Spec, bool) {
// 	spec, ok := r.specs[name]
// 	return spec, ok
// }
//
// // Declarations 返回全部工具声明（保持注册顺序，保证请求体稳定）。
// func (r *Registry) Declarations() []llm.Tool {
// 	out := make([]llm.Tool, 0, len(r.order))
// 	for _, name := range r.order {
// 		out = append(out, r.specs[name].Declaration())
// 	}
// 	return out
// }
//
// // ExecuteRaw 以原始 JSON 参数执行一次工具调用。
// func (r *Registry) ExecuteRaw(ctx context.Context, name, arguments string) (string, error) {
// 	spec, ok := r.specs[name]
// 	if !ok {
// 		return "", fmt.Errorf("Tool %q not found.", name)
// 	}
// 	return spec.Handler(ctx, arguments)
// }
//
// // Execute 以已解析的参数执行一次工具调用。
// func (r *Registry) Execute(ctx context.Context, name string, args map[string]any) (string, error) {
// 	raw := "{}"
// 	if len(args) > 0 {
// 		encoded, err := json.Marshal(args)
// 		if err != nil {
// 			return "", err
// 		}
// 		raw = string(encoded)
// 	}
// 	return r.ExecuteRaw(ctx, name, raw)
// }
//
// // Meta 是声明工具时的可选元信息。
// type Meta struct {
// 	Exclusive bool
// }
//
// // DefineRaw 用带 jsonschema tag 的 Input 结构体声明一个工具，
// // 执行函数直接接收原始 JSON 参数（对应 phero 的 llm.NewTool）。
// func DefineRaw[In any](name, description string, meta Meta, handler Handler) *Spec {
// 	var zero In
// 	return &Spec{
// 		Name:        name,
// 		Description: description,
// 		Parameters:  SchemaOf(zero),
// 		Exclusive:   meta.Exclusive,
// 		Handler:     handler,
// 	}
// }
//
// // DefineMap 声明一个以 map[string]any 参数执行的工具，供需要访问运行态
// // （如当前书籍、当前章节）的写书工具使用；参数 schema 仍由 Input 结构体反射生成。
// func DefineMap[In any](name, description string, meta Meta, handler func(ctx context.Context, args map[string]any) (string, error)) *Spec {
// 	var zero In
// 	return &Spec{
// 		Name:        name,
// 		Description: description,
// 		Parameters:  SchemaOf(zero),
// 		Exclusive:   meta.Exclusive,
// 		Handler: func(ctx context.Context, arguments string) (string, error) {
// 			args := map[string]any{}
// 			if strings.TrimSpace(arguments) != "" {
// 				if err := json.Unmarshal([]byte(arguments), &args); err != nil {
// 					return "", fmt.Errorf("failed to parse arguments: %w", err)
// 				}
// 			}
// 			return handler(ctx, args)
// 		},
// 	}
// }
