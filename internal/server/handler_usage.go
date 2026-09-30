package server

import (
	"net/http"
	"regexp"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"

	"memo/internal/db"
	"memo/internal/response"
)

// usageDateRe is the YYYY-MM-DD shape the client uses as the day key.
var usageDateRe = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}$`)

// registerUsageRoutes mounts the per-day typing/active time endpoints.
func registerUsageRoutes(api chi.Router) {
	api.Get("/usage", usageList)
	api.Post("/usage/upsert", usageUpsert)
}

type usageUpsertInput struct {
	Date     string `json:"date"`
	TypingMs int64  `json:"typingMs"`
	ActiveMs int64  `json:"activeMs"`
}

func usageUpsert(w http.ResponseWriter, r *http.Request) {
	in, ok := entDecode[usageUpsertInput](w, r)
	if !ok {
		return
	}
	if !usageDateRe.MatchString(in.Date) {
		response.Fail(w, http.StatusBadRequest, "Invalid date")
		return
	}
	if in.TypingMs < 0 || in.ActiveMs < 0 {
		response.Fail(w, http.StatusBadRequest, "Invalid duration")
		return
	}

	row, err := db.UpsertUsage(in.Date, in.TypingMs, in.ActiveMs)
	if err != nil {
		response.Fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	response.Success(w, row, "保存成功")
}

// usageList serves ?from=YYYY-MM-DD&to=YYYY-MM-DD, or ?days=N (default 7) as
// a shorthand for the N days ending today.
func usageList(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	now := time.Now()

	from, to := q.Get("from"), q.Get("to")
	if !usageDateRe.MatchString(to) {
		to = now.Format("2006-01-02")
	}
	if !usageDateRe.MatchString(from) {
		days := 7
		if raw := q.Get("days"); raw != "" {
			if n, err := strconv.Atoi(raw); err == nil && n > 0 && n <= 366 {
				days = n
			}
		}
		end, err := time.Parse("2006-01-02", to)
		if err != nil {
			end = now
		}
		from = end.AddDate(0, 0, -(days - 1)).Format("2006-01-02")
	}
	if from > to {
		from, to = to, from
	}

	list, err := db.ListUsage(from, to)
	if err != nil {
		response.Fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	response.Success(w, list, "")
}
