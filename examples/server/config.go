package main

import (
	"fmt"

	"github.com/caarlos0/env/v11"
	"github.com/joho/godotenv"
)

const EnvFile = ".env"

type Env struct {
	LogLevel          string `env:"LOG_LEVEL" envDefault:"info"`
	Port              int    `env:"PORT" envDefault:"4021"`
	PayeeAddress      string `env:"PAYEE_ADDRESS,required"`
	FacilitatorURL    string `env:"FACILITATOR_URL,required"`
	FacilitatorAPIKey string `env:"FACILITATOR_API_KEY"`
	ChainID           string `env:"CAIP2_CHAIN_ID,required"`
	AssetPackage      string `env:"ASSET_PACKAGE,required"`
}

func (e *Env) Parse() error {
	if err := godotenv.Load(EnvFile); err != nil {
		// rely only on env vars
		fmt.Println("Could not load .env file")
	}

	if err := env.Parse(e); err != nil {
		return err
	}
	return nil
}
