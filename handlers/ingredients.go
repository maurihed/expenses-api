package handlers

import (
	"encoding/json"
	"log"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/maurihed/expenses-api/services"
)

func getIngredients(w http.ResponseWriter, r *http.Request) {
	var recipe services.Ingredient
	recipes, err := recipe.GetIngredients()
	if err != nil {
		log.Println(err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(200)
	json.NewEncoder(w).Encode(recipes)
}

func createIngredient(w http.ResponseWriter, r *http.Request) {
	var ingredient services.Ingredient
	err := json.NewDecoder(r.Body).Decode(&ingredient)

	if err != nil {
		log.Fatal(err)
	}

	insertedId, err := ingredient.InsertIngredient(ingredient)
	if err != nil {
		errorRes := Response{
			Msg:  "Error",
			Code: 304,
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(errorRes.Code)
		json.NewEncoder(w).Encode(errorRes)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(200)
	json.NewEncoder(w).Encode(&insertedId)
}

func updateIngredient(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var ingredient services.Ingredient

	err := json.NewDecoder(r.Body).Decode(&ingredient)
	if err != nil {
		log.Println(err)
		return
	}

	err = ingredient.UpdateIngredient(id, ingredient)
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

func deleteIngredient(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var ingredient services.Ingredient

	err := ingredient.DeleteIngredient(id)
	if err != nil {
		errorRes := Response{
			Msg:  "Error deleting ingredient",
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
