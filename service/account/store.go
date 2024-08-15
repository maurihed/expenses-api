package account

import (
	"database/sql"

	types "github.com/maurihed/expenses-api"
)

type Store struct {
	db *sql.DB
}

func NewStore(db *sql.DB) *Store {
	return &Store{db: db}
}

func (s *Store) GetAccountsByUserId(userId int) ([]*types.Account, error) {
	stmt, stmtError := s.db.Prepare("SELECT * FROM accounts WHERE user_id = $1")
	if stmtError != nil {
		return nil, stmtError
	}
	rows, err := stmt.Query(userId)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	accounts := []*types.Account{}

	for rows.Next() {
		var account types.Account
		err = rows.Scan(&account.ID, &account.Name, &account.Amount, &account.UserId)
		if err != nil {
			return nil, err
		}
		accounts = append(accounts, &account)
	}
	return accounts, nil
}
