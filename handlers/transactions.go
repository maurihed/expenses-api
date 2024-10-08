package handlers

import (
	"encoding/json"
	"log"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/maurihed/expenses-api/services"
)

func getTransactions(w http.ResponseWriter, r *http.Request) {
	userId := "PENDING"
	var transaction services.Transaction
	month := r.URL.Query().Get("month")
	year := r.URL.Query().Get("year")
	if month == "" || year == "" {
		now := time.Now()
		year = strconv.Itoa(now.Year())
		month = strconv.Itoa(int(now.Month()) - 1)
	}

	transactions, err := transaction.GetTransactionsByUserId(userId, month, year)
	if err != nil {
		log.Fatal(err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(200)
	json.NewEncoder(w).Encode(transactions)
}

func createTransaction(w http.ResponseWriter, r *http.Request) {
	var transaction services.Transaction
	err := json.NewDecoder(r.Body).Decode(&transaction)
	if err != nil {
		log.Fatal(err)
		return
	}

	result, err := transaction.InsertTransaction(transaction)
	if err != nil {
		errorRes := Response{
			Msg:  err.Error(),
			Code: 304,
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(errorRes.Code)
		json.NewEncoder(w).Encode(errorRes)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(200)
	json.NewEncoder(w).Encode(&result)
}

func updateTransaction(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var transaction services.Transaction
	err := json.NewDecoder(r.Body).Decode(&transaction)
	if err != nil {
		log.Println(err)
		return
	}

	_, err = transaction.UpdateTransaction(id, transaction)
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

func deleteTransaction(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var transaction services.Transaction

	err := transaction.DeleteTransaction(id)
	if err != nil {
		errorRes := Response{
			Msg:  "Error",
			Code: 304,
		}
		json.NewEncoder(w).Encode(errorRes)
		w.WriteHeader(errorRes.Code)
		return
	}

	res := Response{
		Msg:  "Successfully deleted",
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
