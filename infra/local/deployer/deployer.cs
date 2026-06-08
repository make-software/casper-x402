#:property JsonSerializerIsReflectionEnabledByDefault=true
#:package Casper.Network.SDK@3.2.0
#:package DotNetEnv@3.0.0

using System.Diagnostics;
using Casper.Network.SDK;
using Casper.Network.SDK.JsonRpc;
using Casper.Network.SDK.Types;
using DotNetEnv;

class Program
{
    static async Task Main(string[] args)
    {
        await DeployCEP3009();
        await TransferCEP3009(50_000_000_000_000, new AccountHashKey(Values.User2KeyPair.PublicKey));
        await TransferCEP3009(50_000_000_000_000, new AccountHashKey(Values.User3KeyPair.PublicKey));

        var userAccountHash = Values.GetEnvVar("USER_ACCOUNT_HASH_1");
        if(userAccountHash is not null)
            await TransferCEP3009(50_000_000_000_000, new AccountHashKey(userAccountHash));
    }

    static async Task DeployCEP3009()
    {
        var casperSdk = Values.GetCasperClient(false);

        var runtimeArgs = new List<NamedArg>();
        runtimeArgs.Add(new NamedArg("name", $"Casper X402 Token"));
        runtimeArgs.Add(new NamedArg("symbol", "X402"));
        runtimeArgs.Add(new NamedArg("decimals", CLValue.U8(9)));
        runtimeArgs.Add(new NamedArg("initial_supply", CLValue.U256(1_000_000_000_000_000)));
        runtimeArgs.Add(new NamedArg("chain_id", "casper:casper-net-1"));
        runtimeArgs.Add(new NamedArg("odra_cfg_is_upgradable", true));
        runtimeArgs.Add(new NamedArg("odra_cfg_is_upgrade", false));
        runtimeArgs.Add(new NamedArg("odra_cfg_allow_key_override", true));
        runtimeArgs.Add(new NamedArg("odra_cfg_package_hash_key_name", "X402_package_hash"));

        var wasm = System.IO.File.ReadAllBytes("./Cep18X402.wasm");

        var transaction = new Transaction.SessionBuilder()
            .InstallOrUpgrade()
            .From(Values.User1KeyPair.PublicKey)
            .Wasm(wasm)
            .ChainName(Values.ChainName)
            .RuntimeArgs(runtimeArgs)
            .Payment(800_000_000_000)
            .Build();
        transaction.Sign(Values.User1KeyPair);

        Console.WriteLine("CEP-3009 Deploy Transaction Hash: " + transaction.Hash);
        await casperSdk.PutTransaction(transaction);

        var tokenSource = new CancellationTokenSource(TimeSpan.FromSeconds(20));
        await casperSdk.GetTransaction(transaction.Hash, false, tokenSource.Token);

        var response = await casperSdk.GetAccountInfo(Values.User1KeyPair.PublicKey);
        var accountInfo = response.Parse();

        var x402PackageHashNamedKey = accountInfo.Account.NamedKeys.FirstOrDefault(k => k.Name == "X402_package_hash");
        if(x402PackageHashNamedKey is null)
            throw new Exception("X402 package hash not found under the account's named keys");

        Console.WriteLine("X402 Test Token package hash: " + x402PackageHashNamedKey.Key.ToString());
        await File.WriteAllTextAsync(Values.GetEnvVar("X402_CONTRACT_ADDRESS_FILE"),
            x402PackageHashNamedKey.Key.ToString());
    }

    static async Task TransferCEP3009(ulong amount, AccountHashKey recipient)
    {
        var casperSdk = Values.GetCasperClient(false);

        var runtimeArgs = new List<NamedArg>();
        runtimeArgs.Add(new NamedArg("amount", CLValue.U256(amount)));
        runtimeArgs.Add(new NamedArg("recipient", CLValue.Key(recipient)));

        var transaction = new Transaction.ContractCallBuilder()
            .ByPackageName("X402_package_hash")
            .EntryPoint("transfer")
            .From(Values.User1KeyPair.PublicKey)
            .ChainName(Values.ChainName)
            .RuntimeArgs(runtimeArgs)
            .Payment(2_500_000_000)
            .Build();
        transaction.Sign(Values.User1KeyPair);

        Console.WriteLine("Transfer Transaction Hash: " + transaction.Hash);
        await casperSdk.PutTransaction(transaction);
        var tokenSource = new CancellationTokenSource(TimeSpan.FromSeconds(20));
        await casperSdk.GetTransaction(transaction.Hash, false, tokenSource.Token);

        Console.WriteLine("Transferred");
    }
}

public static partial class Values
{
    private static bool _loaded;
    private static readonly object _lock = new();

    public static void Load()
    {
        lock (_lock)
        {
            if (_loaded)
                return;

            Env.Load();

            _loaded = true;
        }
    }

    public static string NodeAddress
    {
        get
        {
            Load();
            string value = Environment.GetEnvironmentVariable("NODE_ADDRESS");
            Debug.Assert(value is not null);
            return value;
        }
    }

    public static NetCasperClient GetCasperClient(bool logging = false)
    {
        RpcLoggingHandler loggingHandler = null;
        if (logging)
            loggingHandler = new RpcLoggingHandler(new HttpClientHandler())
            {
                LoggerStream = new StreamWriter(Console.OpenStandardOutput())
            };

        var httpClient = loggingHandler != null ? new HttpClient(loggingHandler) : new HttpClient();
        var authKey = Environment.GetEnvironmentVariable("CSPR_CLOUD_API_KEY");
        if (authKey != null)
            httpClient.DefaultRequestHeaders.Add("Authorization", authKey);

        return new NetCasperClient(NodeAddress, httpClient);
    }

    static string _apiVersion = string.Empty;
    static readonly SemaphoreSlim _semaphore = new(1, 1);

    public static async Task<string> GetApiVersion(ICasperClient casperSdk)
    {
        await _semaphore.WaitAsync();
        try
        {
            if (!string.IsNullOrWhiteSpace(_apiVersion))
                return _apiVersion;

            var nodeStatusResponse = await casperSdk.GetNodeStatus();

            _apiVersion = nodeStatusResponse.Parse().ApiVersion.Substring(0, 1);

            return _apiVersion;
        }
        finally
        {
            _semaphore.Release();
        }
    }

    public static string ChainName
    {
        get
        {
            Load();
            var value = Environment.GetEnvironmentVariable("CHAIN_NAME");
            Debug.Assert(value is not null);
            return value;
        }
    }

    public static string GetEnvVar(string name)
    {
        return Environment.GetEnvironmentVariable(name) ??
               throw new NullReferenceException($"Environment variable {name} was not found");
    }

    private static KeyPair GetKeyPair(string envVar)
    {
        Load();
        var file = Environment.GetEnvironmentVariable(envVar);
        Debug.Assert(file is not null);
        var value = KeyPair.FromPem(file);
        Debug.Assert(value is not null);
        return value;
    }

    public static KeyPair User1KeyPair => GetKeyPair("USER_1");
    public static KeyPair User2KeyPair => GetKeyPair("USER_2");
    public static KeyPair User3KeyPair => GetKeyPair("USER_3");
    public static KeyPair User4KeyPair => GetKeyPair("USER_4");
    public static KeyPair User5KeyPair => GetKeyPair("USER_5");
    public static KeyPair User6KeyPair => GetKeyPair("USER_6");
    public static KeyPair User7KeyPair => GetKeyPair("USER_7");
    public static KeyPair User8KeyPair => GetKeyPair("USER_8");
    public static KeyPair User9KeyPair => GetKeyPair("USER_9");
    public static KeyPair User10KeyPair => GetKeyPair("USER_10");

    public static KeyPair Node1KeyPair => GetKeyPair("NODE_1");
    public static KeyPair Node2KeyPair => GetKeyPair("NODE_2");
    public static KeyPair Node3KeyPair => GetKeyPair("NODE_3");
    public static KeyPair Node4KeyPair => GetKeyPair("NODE_4");
    public static KeyPair Node5KeyPair => GetKeyPair("NODE_5");
    public static KeyPair Node6KeyPair => GetKeyPair("NODE_6");
    public static KeyPair Node7KeyPair => GetKeyPair("NODE_7");
    public static KeyPair Node8KeyPair => GetKeyPair("NODE_8");
    public static KeyPair Node9KeyPair => GetKeyPair("NODE_9");
    public static KeyPair Node10KeyPair => GetKeyPair("NODE_10");
}