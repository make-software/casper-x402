---
The `deployer` binary has been copied from: https://github.com/odradev/casper-x402-poc/tree/main/contract
Modified to transfer some amount of the CEP-18 token to two addresses defined in env vars.
It's used by the `docker-compose.yaml` to deploy an instance of the CEP-18 token during deployment of all components.

```
use cep18_x402::cep18_x402::{Cep18X402, Cep18X402InitArgs};
use odra::{host::Deployer, prelude::Addressable};
use odra::casper_types::account::AccountHash;
use odra::casper_types::{U256, U512};
use odra::prelude::*;

fn main() {
    let env = odra_casper_livenet_env::env();
    let chain_name = "casper:casper-net-1";// std::env::var("ODRA_CASPER_LIVENET_CHAIN_NAME").expect("Missing chain name");
    let address_file_path = std::env::var("X402_CONTRACT_ADDRESS_FILE")
        .expect("Address file path must be set in X402_CONTRACT_ADDRESS_FILE env var");
    // Check if the contract is already deployed by looking for the address file
    if std::path::Path::new(&address_file_path).exists() {
        let address_str = std::fs::read_to_string(&address_file_path)
            .expect("Failed to read contract address from file");
        println!("Contract already deployed at address: {}", address_str);
        return;
    }

    env.set_gas(500_000_000_000);
    let contract = Cep18X402::try_deploy(
        &env,
        Cep18X402InitArgs {
            symbol: "X402".to_string(),
            name: "Casper X402 Token".to_string(),
            decimals: 2,
            initial_supply: 1_000_000_000.into(),
            chain_name: chain_name.to_string(),
        },
    );
    let mut contract = contract.expect("Failed to deploy contract");
    std::fs::write(&address_file_path, contract.address().to_string())
        .expect("Failed to write contract address to file");

    // Verify deployment by reading the address back and creating a host reference
    let address_str = std::fs::read_to_string(&address_file_path)
        .expect("Failed to read contract address from file");
    println!("Deployed contract address: {}", address_str);

    let acc1 = AccountHash::from_formatted_str(
        &std::env::var("EXTERNAL_ACCOUNT_HASH_1")
            .expect("Missing chain name")
    ).unwrap();

    env.set_gas(5_000_000_000);
    contract.try_transfer(
        &Address::Account(acc1),
        &U256::from(500_000_00u64),
    ).expect("Failed to transfer tokens to the external account");

    let acc2 = AccountHash::from_formatted_str(
        &std::env::var("EXTERNAL_ACCOUNT_HASH_2")
            .expect("Missing chain name")
    ).unwrap();

    env.set_gas(5_000_000_000);
    contract.try_transfer(
        &Address::Account(acc2),
        &U256::from(500_000_00u64),
    ).expect("Failed to transfer tokens to the external account");
}
```
