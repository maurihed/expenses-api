package account

import (
	"encoding/json"
	"net/http"

	"github.com/gorilla/mux"
	types "github.com/maurihed/expenses-api"
)

type Handler struct {
	store types.AccountStore
}

func NewHandler(store types.AccountStore) *Handler {
	return &Handler{store: store}
}

func (h *Handler) RegisterRoutes(router *mux.Router) {
	router.HandleFunc("/accounts", h.getAccounts).Methods("GET")
	router.HandleFunc("/account/{id}", h.getAccount).Methods("GET")
}

func (h *Handler) getAccounts(w http.ResponseWriter, r *http.Request) {
	// TODO: Replace 1 with a real user id
	accounts, err := h.store.GetAccountsByUserId(1)

	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(accounts)
}

func (h *Handler) getAccount(w http.ResponseWriter, r *http.Request) {

}
