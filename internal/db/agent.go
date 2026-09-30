package db

import "database/sql"

// Agent mirrors the `agents` table / the frontend `MyAgent` type.
type Agent struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description"`
	Content     string `json:"content"`
}

const agentColumns = "id, name, description, content"

func scanAgent(row rowScanner) (*Agent, error) {
	a := &Agent{}
	if err := row.Scan(&a.ID, &a.Name, &a.Description, &a.Content); err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	return a, nil
}

func ListAgents() ([]Agent, error) {
	rows, err := DB().Query("SELECT " + agentColumns + " FROM agents")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Agent{}
	for rows.Next() {
		a, err := scanAgent(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *a)
	}
	return out, rows.Err()
}

func GetAgent(id string) (*Agent, error) {
	return scanAgent(DB().QueryRow("SELECT "+agentColumns+" FROM agents WHERE id = ?", id))
}

func CreateAgent(a *Agent) (*Agent, error) {
	if _, err := DB().Exec(
		"INSERT INTO agents (id, name, description, content) VALUES (?, ?, ?, ?)",
		a.ID, a.Name, a.Description, a.Content,
	); err != nil {
		return nil, err
	}
	return a, nil
}

func UpdateAgent(id string, updates map[string]any) (*Agent, error) {
	fields, args := buildUpdate(updates, "id")
	if len(fields) == 0 {
		return nil, nil
	}
	args = append(args, id)
	if _, err := DB().Exec("UPDATE agents SET "+joinFields(fields)+" WHERE id = ?", args...); err != nil {
		return nil, err
	}
	return GetAgent(id)
}

func DeleteAgent(id string) (bool, error) {
	res, err := DB().Exec("DELETE FROM agents WHERE id = ?", id)
	if err != nil {
		return false, err
	}
	n, _ := res.RowsAffected()
	return n > 0, nil
}
