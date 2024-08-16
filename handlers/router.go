package handlers

import (
	"github.com/go-chi/chi/v5"
	"github.com/go-chi/cors"
)

type Response struct {
	Msg  string `json:"msg"`
	Code int    `json:"code"`
}

func CreateRouter() *chi.Mux {
	router := chi.NewRouter()

	router.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{"https://expenses-beta.vercel.app", "http://localhost:5173"},
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type", "X-CSRF-Token"},
		ExposedHeaders:   []string{"Link"},
		AllowCredentials: true,
		MaxAge:           300, // Maximum value not ignored by any of major browsers
	}))

	router.Route("/api", func(router chi.Router) {

		// version 1
		router.Route("/v1", func(router chi.Router) {
			router.Get("/healthCheck", healthCheck)

			router.Route("/accounts", func(router chi.Router) {
				router.Get("/", getAccounts)
				router.Post("/", createAccount)
				router.Put("/{id}", updateAccount)
			})

			router.Route("/transactions", func(router chi.Router) {
				router.Get("/", getTransactions)
				router.Post("/", createTransaction)
				router.Put("/{id}", updateTransaction)
				router.Delete("/{id}", deleteTransaction)
			})
		})

		// version 2 - add it if you want
		// router.Route("/v2", func(router chi.Router) {
		// })

	})

	return router
}
