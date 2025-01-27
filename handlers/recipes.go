package handlers

import (
	"encoding/json"
	"log"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/maurihed/expenses-api/services"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

func getRecipe(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	objectId, err := primitive.ObjectIDFromHex(id)
	if err != nil {
		log.Fatalf("Invalid ObjectId: %v", err)
	}

	var recipe services.Recipe
	foundRecipe, err := recipe.GetRecipeById(objectId)
	if err != nil {
		log.Println(err)
		return
	}
	recipe = *foundRecipe

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(200)
	json.NewEncoder(w).Encode(recipe)
}

func getRecipes(w http.ResponseWriter, r *http.Request) {
	println("getRecipes called")
	var recipe services.Recipe
	// TODO: replace with real user
	recipes, err := recipe.GetRecipesByUserId("PENDING")
	if err != nil {
		log.Println(err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(200)
	json.NewEncoder(w).Encode(recipes)
}

func createRecipe(w http.ResponseWriter, r *http.Request) {
	var recipe services.Recipe
	err := json.NewDecoder(r.Body).Decode(&recipe)
	recipe.UserID = "PENDING"

	if err != nil {
		log.Fatal(err)
	}

	insertedId, err := recipe.InsertRecipe(recipe)
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

func updateRecipe(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var recipe services.Recipe

	err := json.NewDecoder(r.Body).Decode(&recipe)
	if err != nil {
		log.Println(err)
		return
	}

	err = recipe.UpdateRecipe(id, recipe)
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

func deleteRecipe(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var recipe services.Recipe

	err := recipe.DeleteRecipe(id)
	if err != nil {
		errorRes := Response{
			Msg:  "Error deleting recipe",
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
