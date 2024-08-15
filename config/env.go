package config

import (
	"os"

	"github.com/joho/godotenv"
)

type Config struct {
	DBHost     string
	DBPort     string
	DBUser     string
	DBPassword string
	DBName     string
}

var Envs = initConfig()

func initConfig() Config {
	godotenv.Load()

	return Config{
		DBHost:     getEnv("MONGO_DB_HOST", "localhost"),
		DBUser:     getEnv("MONGO_DB_USERNAME", "postgres"),
		DBPassword: getEnv("MONGO_DB_PASSWORD", "olv"),
		DBName:     getEnv("MONGO_DB", "expenses"),
	}
}

func getEnv(key, fallback string) string {
	if value, ok := os.LookupEnv(key); ok {
		return value
	}
	return fallback
}
