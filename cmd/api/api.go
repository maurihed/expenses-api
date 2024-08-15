package api

import (
	"database/sql"
	"net/http"

	"github.com/gorilla/mux"
	"github.com/maurihed/expenses-api/service/account"
)

type APIServer struct {
	addr string
	db   *sql.DB
}

func NewAPIServer(addr string, db *sql.DB) *APIServer {
	return &APIServer{
		addr: addr,
		db:   db,
	}
}

func (s *APIServer) Run() error {
	router := mux.NewRouter()
	subRouter := router.PathPrefix("/api/v1").Subrouter()

	accountStore := account.NewStore(s.db)
	userHandler := account.NewHandler(accountStore)
	userHandler.RegisterRoutes(subRouter)

	return http.ListenAndServe(s.addr, router)
}
