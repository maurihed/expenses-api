package services

import (
	"context"
	"errors"
	"log"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

type Ingredient struct {
	Id        primitive.ObjectID `json:"id,omitempty" bson:"_id,omitempty"`
	Name      string             `json:"name,omitempty" bson:"name,omitempty"`
	Content   float64            `json:"content,omitempty" bson:"content,omitempty"`
	Price     float64            `json:"price,omitempty" bson:"price,omitempty"`
	Quantity  float64            `json:"quantity,omitempty" bson:"quantity,omitempty"`
	Unit      string             `json:"unit,omitempty" bson:"unit,omitempty"`
	UnitPrice float64            `json:"unitPrice,omitempty" bson:"unitPrice,omitempty"`
}

func (i *Ingredient) GetIngredients() ([]Ingredient, error) {
	collection := getCollectionPointer("ingredients")

	var ingredients []Ingredient
	cursor, err := collection.Find(context.TODO(), bson.M{})
	if err != nil {
		log.Fatal(err)
		return nil, err
	}

	defer cursor.Close(context.Background())

	for cursor.Next(context.Background()) {
		var ingredient Ingredient
		cursor.Decode(&ingredient)
		ingredients = append(ingredients, ingredient)
	}

	return ingredients, nil
}

func (i *Ingredient) InsertIngredient(entry Ingredient) (*InsertedId, error) {
	collection := getCollectionPointer("ingredients")
	result, err := collection.InsertOne(context.TODO(), Ingredient{
		Name:    entry.Name,
		Content: entry.Content,
		Price:   entry.Price,
		Unit:    entry.Unit,
	})

	if err != nil {
		log.Printf("Error inserting ingredient: %v", err)
		return nil, err
	}

	if oid, ok := result.InsertedID.(primitive.ObjectID); ok {
		return &InsertedId{ID: oid.Hex()}, nil
	}

	return nil, errors.New("unable to get a valid object id")
}

func (i *Ingredient) UpdateIngredient(id string, entry Ingredient) error {
	collection := getCollectionPointer("ingredients")
	mongoID, err := primitive.ObjectIDFromHex(id)
	if err != nil {
		return err
	}

	update := bson.D{
		{Key: "$set", Value: bson.D{
			{Key: "name", Value: entry.Name},
			{Key: "content", Value: entry.Content},
			{Key: "price", Value: entry.Price},
			{Key: "unit", Value: entry.Unit},
		}},
	}

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

func (i *Ingredient) DeleteIngredient(id string) error {
	collection := getCollectionPointer("ingredients")
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
