package services

import (
	"context"
	"errors"
	"fmt"
	"log"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

type Ingredient struct {
	Id        primitive.ObjectID `json:"id,omitempty" bson:"id,omitempty"`
	Name      string             `json:"name,omitempty" bson:"name,omitempty"`
	Content   float64            `json:"content,omitempty" bson:"content,omitempty"`
	Price     float64            `json:"price,omitempty" bson:"price,omitempty"`
	Quantity  float64            `json:"quantity,omitempty" bson:"quantity,omitempty"`
	Unit      string             `json:"unit,omitempty" bson:"unit,omitempty"`
	UnitPrice float64            `json:"unitPrice,omitempty" bson:"unitPrice,omitempty"`
}

type Recipe struct {
	ID          string       `json:"id,omitempty" bson:"_id,omitempty"`
	Name        string       `json:"name,omitempty" bson:"name,omitempty"`
	Description string       `json:"description,omitempty" bson:"description,omitempty"`
	Molde       string       `json:"molde,omitempty" bson:"molde,omitempty"`
	Ingredients []Ingredient `json:"ingredients,omitempty" bson:"ingredients,omitempty"`
	Steps       []string     `json:"steps,omitempty" bson:"steps,omitempty"`
	Image       string       `json:"image" bson:"image"`
	UserID      string       `json:"userId,omitempty" bson:"userId,omitempty"`
}

func (t *Recipe) GetRecipeById(id primitive.ObjectID) (*Recipe, error) {
	recipeCollection := getCollectionPointer("recipes")
	pipeline := []bson.M{
		{
			"$match": bson.M{
				"_id": id, // Filter by user ID
			},
		},
		{
			"$unwind": "$ingredients", // Unwind the ingredients array to work with individual ingredients
		},
		{
			"$lookup": bson.M{
				"from":         "ingredients",    // Join with the ingredients collection
				"localField":   "ingredients.id", // Field in recipe collection
				"foreignField": "_id",            // Field in ingredient collection
				"as":           "ingredient",     // Alias for the joined data
			},
		},
		{
			"$unwind": "$ingredient", // Unwind the ingredient array after the join
		},
		{
			"$group": bson.M{
				"_id":  "$_id",                    // Group by recipe ID
				"name": bson.M{"$first": "$name"}, // Keep the recipe name
				"ingredients": bson.M{
					"$push": bson.M{
						"id":       "$ingredient._id",
						"name":     "$ingredient.name",
						"content":  "$ingredient.content",
						"price":    "$ingredient.price",
						"unit":     "$ingredient.unit",
						"quantity": "$ingredients.quantity",
					},
				},
			},
		},
	}

	cursor, err := recipeCollection.Aggregate(context.Background(), pipeline)
	if err != nil {
		return nil, fmt.Errorf("failed to execute aggregation: %v", err)
	}
	defer cursor.Close(context.Background())

	var recipe Recipe
	if cursor.Next(context.Background()) {
		if err := cursor.Decode(&recipe); err != nil {
			return nil, fmt.Errorf("failed to decode recipe: %v", err)
		}
		return &recipe, nil
	}

	return nil, errors.New("recipe not found")
}

func (t *Recipe) GetRecipesByUserId(userId string) ([]Recipe, error) {
	recipeCollection := getCollectionPointer("recipes")
	var recipes []Recipe

	pipeline := []bson.M{
		{
			"$match": bson.M{
				"userId": userId, // Filter by user ID
			},
		},
		{
			"$unwind": "$ingredients", // Unwind the ingredients array to work with individual ingredients
		},
		{
			"$lookup": bson.M{
				"from":         "ingredients",    // Join with the ingredients collection
				"localField":   "ingredients.id", // Field in recipe collection
				"foreignField": "_id",            // Field in ingredient collection
				"as":           "ingredient",     // Alias for the joined data
			},
		},
		{
			"$unwind": "$ingredient", // Unwind the ingredient array after the join
		},
		{
			"$group": bson.M{
				"_id":  "$_id",                    // Group by recipe ID
				"name": bson.M{"$first": "$name"}, // Keep the recipe name
				"ingredients": bson.M{
					"$push": bson.M{
						"id":       "$ingredient._id",
						"content":  "$ingredient.content",
						"price":    "$ingredient.price",
						"quantity": "$ingredients.quantity",
					},
				},
			},
		},
		// {
		// 	"$addFields": bson.M{
		// 		"ingredients": bson.M{
		// 			"$map": bson.M{
		// 				"input": "$ingredients",
		// 				"as":    "ingredient",
		// 				"in": bson.M{
		// 					"_id":      "$$ingredient._id",
		// 					"quantity": "$$ingredient.quantity",
		// 					"unitPrice": bson.M{
		// 						"$cond": bson.M{
		// 							"if":   bson.M{"$eq": []interface{}{"$$ingredient.content", 0}},
		// 							"then": 0, // Prevent division by zero
		// 							"else": bson.M{"$divide": []interface{}{"$$ingredient.price", "$$ingredient.content"}},
		// 						},
		// 					},
		// 				},
		// 			},
		// 		},
		// 	},
		// },
	}

	// Execute the aggregation pipeline
	cursor, err := recipeCollection.Aggregate(context.Background(), pipeline)
	if err != nil {
		return nil, fmt.Errorf("failed to execute aggregation: %v", err)
	}
	defer cursor.Close(context.Background())

	// Iterate over the results
	for cursor.Next(context.Background()) {
		var recipe Recipe
		if err := cursor.Decode(&recipe); err != nil {
			log.Printf("Failed to decode recipe: %v", err)
			continue
		}

		// Calculate the unitPrice for each ingredient
		for i, ingredient := range recipe.Ingredients {
			if ingredient.Content != 0 {
				recipe.Ingredients[i] = Ingredient{
					Id:        ingredient.Id,
					Quantity:  recipe.Ingredients[i].Quantity,
					UnitPrice: ingredient.Price / ingredient.Content,
				}
			} else {
				recipe.Ingredients[i] = Ingredient{
					Id:        ingredient.Id,
					Quantity:  recipe.Ingredients[i].Quantity,
					UnitPrice: 0,
				}
			}
		}

		// Add the updated recipe to the recipes slice
		recipes = append(recipes, recipe)
	}

	// Check for cursor iteration errors
	if err := cursor.Err(); err != nil {
		return nil, fmt.Errorf("cursor error: %v", err)
	}

	if len(recipes) == 0 {
		return []Recipe{}, nil
	}

	return recipes, nil
}

func (a *Recipe) InsertRecipe(entry Recipe) (*InsertedId, error) {
	collection := getCollectionPointer("recipes")
	var ingredients []Ingredient

	for _, ingredient := range entry.Ingredients {
		objectId, err := primitive.ObjectIDFromHex(ingredient.Id.Hex())
		if err != nil {
			log.Fatalf("Invalid ObjectId: %v", err)
		}

		ingredients = append(ingredients, Ingredient{
			Id:       objectId,
			Quantity: ingredient.Quantity,
		})
	}

	result, err := collection.InsertOne(context.TODO(), Recipe{
		Name:        entry.Name,
		Description: entry.Description,
		Molde:       entry.Molde,
		Ingredients: ingredients,
		Steps:       entry.Steps,
		Image:       entry.Image,
		UserID:      entry.UserID,
	})

	if err != nil {
		log.Printf("Error inserting Recipe: %v", err)
		return nil, err
	}

	if oid, ok := result.InsertedID.(primitive.ObjectID); ok {
		return &InsertedId{ID: oid.Hex()}, nil
	}

	return nil, errors.New("unable to get a valid object id")
}

func (r *Recipe) UpdateRecipe(id string, entry Recipe) error {
	collection := getCollectionPointer("recipes")
	mongoID, err := primitive.ObjectIDFromHex(id)
	if err != nil {
		log.Println(err)
		return err
	}

	update := bson.D{
		{Key: "$set", Value: bson.D{
			{Key: "name", Value: entry.Name},
			{Key: "description", Value: entry.Description},
			{Key: "Molde", Value: entry.Molde},
			{Key: "ingredients", Value: entry.Ingredients},
			{Key: "steps", Value: entry.Steps},
			{Key: "image", Value: entry.Image},
		}},
	}

	/*	Alternative update code
		_, err = collection.UpdateOne(
			context.Background(),
			bson.M{"_id": mongoID},
			bson.M{"$set": recipe},
		)
	*/
	_, err = collection.UpdateOne(
		context.Background(),
		bson.M{"_id": mongoID},
		update,
	)

	if err != nil {
		log.Println(err)
		return err
	}

	return nil
}

func (r *Recipe) DeleteRecipe(id string) error {
	collection := getCollectionPointer("recipes")
	mongoID, err := primitive.ObjectIDFromHex(id)
	if err != nil {
		log.Println(err)
		return err
	}

	_, err = collection.DeleteOne(
		context.Background(),
		bson.M{"_id": mongoID},
	)
	if err != nil {
		log.Println(err)
		return err
	}

	return nil
}
