package handlers

import (
	"encoding/json"
	"log"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/maurihed/expenses-api/services"
)

func getAccounts(w http.ResponseWriter, r *http.Request) {
	var account services.Account
	// TODO: replace with real user
	accounts, err := account.GetAccountsByUserId("PENDING")
	if err != nil {
		log.Println(err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(200)
	json.NewEncoder(w).Encode(accounts)
}

func createAccount(w http.ResponseWriter, r *http.Request) {
	var account services.Account
	err := json.NewDecoder(r.Body).Decode(&account)
	account.UserId = "PENDING"

	if err != nil {
		log.Fatal(err)
	}

	err = account.InsertAccount(account)
	if err != nil {
		errorRes := Response{
			Msg:  "Error",
			Code: 304,
		}
		json.NewEncoder(w).Encode(errorRes)
		return
	}

	res := Response{
		Msg:  "Successfully Created Account",
		Code: 201,
	}

	jsonStr, err := json.Marshal(res)
	if err != nil {
		log.Fatal(err)
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(res.Code)
	w.Write(jsonStr)
}

func updateAccount(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var account services.Account

	err := json.NewDecoder(r.Body).Decode(&account)
	if err != nil {
		log.Println(err)
		return
	}

	_, err = account.UpdateAccount(id, account)
	if err != nil {
		errorRes := Response{
			Msg:  err.Error(),
			Code: 500,
		}
		jsonStr, err := json.Marshal(errorRes)
		if err != nil {
			log.Fatal(err)
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(errorRes.Code)
		w.Write(jsonStr)
		return
	}

	res := Response{
		Msg:  "Successfully updated",
		Code: 200,
	}

	jsonStr, err := json.Marshal(res)
	if err != nil {
		log.Fatal(err)
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(res.Code)
	w.Write(jsonStr)
}
