package types

type AccountStore interface {
	GetAccountsByUserId(userId int) ([]*Account, error)
}

type Account struct {
	ID     int    `json:"id"`
	Name   string `json:"name"`
	Amount string `json:"amount"`
	UserId string `json:"UserId"`
}
