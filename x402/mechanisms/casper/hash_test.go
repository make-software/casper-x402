package casper_test

import (
	"encoding/hex"
	"math/big"
	"testing"

	eip712 "github.com/casper-ecosystem/casper-eip-712/go"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestTransferWithAuthorizationDigest_Vector(t *testing.T) {
	contractPackageHash, err := hex.DecodeString("aabbccddeeff0011223344556677889900aabbccddeeff001122334455667788")
	require.NoError(t, err)
	var cpHash [32]byte
	copy(cpHash[:], contractPackageHash)

	domain := eip712.BuildDomain("TestToken", "1", "casper-test", cpHash)

	fromAddr, err := eip712.NewAddressFromHex("0x01aabbccddeeff0011223344556677889900aabbccddeeff001122334455667788")
	require.NoError(t, err)
	toAddr, err := eip712.NewAddressFromHex("0x00aabbccddeeff0011223344556677889900aabbccddeeff001122334455667788")
	require.NoError(t, err)

	var nonceBytes [32]byte
	nonceRaw, err := hex.DecodeString("aabbccddeeff0011223344556677889900aabbccddeeff001122334455667788")
	require.NoError(t, err)
	copy(nonceBytes[:], nonceRaw)

	types := eip712.TypeDefinitions{
		"TransferAuthorization": {
			{Name: "from", Type: "address"},
			{Name: "to", Type: "address"},
			{Name: "value", Type: "uint256"},
			{Name: "validAfter", Type: "uint256"},
			{Name: "validBefore", Type: "uint256"},
			{Name: "nonce", Type: "bytes32"},
		},
	}

	message := map[string]interface{}{
		"from":        fromAddr,
		"to":          toAddr,
		"value":       big.NewInt(1000000),
		"validAfter":  big.NewInt(1700000000),
		"validBefore": big.NewInt(1700001000),
		"nonce":       nonceBytes,
	}

	digest, err := eip712.HashTypedData(
		domain,
		types,
		"TransferAuthorization",
		message,
		&eip712.TypedDataOptions{DomainTypes: eip712.CasperDomainTypes},
	)
	require.NoError(t, err)

	assert.Equal(t, "3b3414c8ad7d0ecf157de6429623ec25ff1a78c6ce9e1503db9d572de7145f9f", hex.EncodeToString(digest[:]))
}
