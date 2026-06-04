import { useEffect, useState } from 'react';
import { FlexColumn, FlexRow, Button } from '@make-software/cspr-design';
import { Card, CardColumn, CardTitle, Divider, FieldLabel, FieldValue, ResultTextarea } from './SignTypedData.styled';
import { PublicKey } from 'casper-js-sdk';
import { PaymentRequirement, PaymentRequiredHeader, parseAmount, parseBase64Json, formatDisplayAmount } from './x402-utils';

const WEATHER_URL = 'http://localhost:4021/weather?city=San%20Francisco';
const DEFAULT_DOMAIN_NAME = 'n/a';
const DEFAULT_DOMAIN_VERSION = 'n/a';

export default function SignedTypedData({ publicKey }: { publicKey: string }) {
  const [verifyResult, setVerifyResult] = useState<string>('');
  const [paymentResponse, setPaymentResponse] = useState<string>('');
  const [paymentInfo, setPaymentInfo] = useState<PaymentRequiredHeader | null>(null);
  const [paymentRequirement, setPaymentRequirement] = useState<PaymentRequirement | null>(null);
  const [resourceUrl, setResourceUrl] = useState<string>(WEATHER_URL);

  const accountHash = publicKey 
    ? '00' + PublicKey.fromHex(publicKey).accountHash().toHex().replace('account-hash-','')
    : null;
    
  useEffect(() => {
    let isMounted = true;

    const loadPaymentInfo = async () => {
      try {
        const challengeResponse = await fetch(WEATHER_URL);
        const paymentRequired = challengeResponse.headers.get('Payment-Required');

        if (challengeResponse.status !== 402 || !paymentRequired) {
          const unexpectedBody = await challengeResponse.text();

          if (isMounted) {
            setVerifyResult(
              JSON.stringify(
                {
                  error: 'Expected a 402 payment challenge from the weather endpoint',
                  status: challengeResponse.status,
                  body: unexpectedBody
                },
                null,
                2
              )
            );
          }
          return;
        }

        const nextPaymentInfo = parseBase64Json<PaymentRequiredHeader>(paymentRequired);
        const accepted = nextPaymentInfo.accepts[0];

        if (!accepted) {
          throw new Error('Payment challenge did not include an accepted payment option');
        }

        if (isMounted) {
          setPaymentInfo(nextPaymentInfo);
          setPaymentRequirement(accepted);
          setResourceUrl(nextPaymentInfo.resource.url || WEATHER_URL);
        }
      } catch (error) {
        if (isMounted) {
          console.error("Error loading payment information", error);
          setVerifyResult(
            JSON.stringify(
              {
                error: error instanceof Error ? error.message : 'Unknown error'
              },
              null,
              2
            )
          );
        }
      }
    };

    void loadPaymentInfo();

    return () => {
      isMounted = false;
    };
  }, []);

  const handleSignTypedData = async () => {
    setVerifyResult('requesting signature from wallet...');
    setPaymentResponse('');
    
    try {
      if (!paymentInfo || !paymentRequirement) {
        setVerifyResult(JSON.stringify({
          error: 'Payment information is still loading. Please try again in a moment.'
        }, null, 2));
        return;
      }

      const randomBytes = new Uint8Array(32);
      crypto.getRandomValues(randomBytes);
      const nonce = Array.from(randomBytes).map(b => b.toString(16).padStart(2, '0')).join('');
      const valid_after = Math.floor(Date.now() / 1000);
      const valid_before = valid_after + 60 * 60;
      const value = parseAmount(paymentRequirement.amount);
      const assetName = paymentRequirement.extra?.name ?? DEFAULT_DOMAIN_NAME;
      const assetVersion = paymentRequirement.extra?.version ?? DEFAULT_DOMAIN_VERSION;

      const params = {
        typedData: {
          domain: {
            name: assetName,
            version: assetVersion,
            chain_name: paymentRequirement.network,
            contract_package_hash: paymentRequirement.asset,
          },
          types: {
            TransferWithAuthorization: [
              { name: 'from', type: 'address' },
              { name: 'to', type: 'address' },
              { name: 'value', type: 'uint256' },
              { name: 'validAfter', type: 'uint256' },
              { name: 'validBefore', type: 'uint256' },
              { name: 'nonce', type: 'bytes32' }
            ]
          },
          primaryType: 'TransferWithAuthorization',
          message: {
            from: accountHash ?? '',
            to: paymentRequirement.payTo,
            value,
            validAfter: valid_after,
            validBefore: valid_before,
            nonce
          }
        },
        options: {
          returnHashArtifacts: true
        }
      };

      console.info('Signing parameters', params);

      const clickRef = window.csprclick as any;
      console.info('Invoking signTypedData with parameters', params, 'and publicKey', publicKey.toLowerCase());
      const res = await clickRef.signTypedData(params, publicKey.toLowerCase());

      if (res?.cancelled || res?.error) {
        setVerifyResult(JSON.stringify({ error: res.error ?? 'Signing cancelled' }, null, 2));
        return;
      }

      console.info('Signature result', res);

      const paymentPayload = {
        x402Version: paymentInfo.x402Version,
        resource: {
          url: paymentInfo.resource.url || WEATHER_URL
        },
        accepted: paymentRequirement,
        payload: {
          authorization: {
            from: accountHash ?? '',
            to: paymentRequirement.payTo,
            value: paymentRequirement.amount,
            validAfter: valid_after.toString(),
            validBefore: valid_before.toString(),
            nonce: nonce
          },
          publicKey: res.publicKey,
          signature: res.signatureHex
        }
      };

      console.info('Payment payload', paymentPayload);

      setVerifyResult('Submitting payment and fetching resource... wait...');

      const paidResponse = await fetch(/*paymentInfo.resource.url ||*/ WEATHER_URL, {
        method: 'GET',
        headers: { 'PAYMENT-SIGNATURE': btoa(JSON.stringify(paymentPayload)) }
      });

      const responseText = await paidResponse.text();
      let formattedResponse = responseText;

      try {
        formattedResponse = JSON.stringify(JSON.parse(responseText), null, 2);
      } catch {
        // Keep non-JSON responses as-is.
      }

      setVerifyResult(formattedResponse);

      const paymentResponseHeader = paidResponse.headers.get('PAYMENT-RESPONSE');
      if (paymentResponseHeader) {
        setPaymentResponse(atob(paymentResponseHeader));
      }
    } catch (error) {
      setVerifyResult(JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error'
      }, null, 2));
    }
  };

  return (
    <FlexColumn style={{ marginTop: '24px' }}>
      <Card>
        <CardTitle>EIP-712 Typed Data</CardTitle>
        <Divider />
        <CardTitle>Domain</CardTitle>
        <CardColumn>
          <FieldLabel>name</FieldLabel>
          <FieldValue>{paymentRequirement?.extra?.name ?? DEFAULT_DOMAIN_NAME}</FieldValue>
        </CardColumn>
        <CardColumn>
          <FieldLabel>version</FieldLabel>
          <FieldValue>{paymentRequirement?.extra?.version ?? DEFAULT_DOMAIN_VERSION}</FieldValue>
        </CardColumn>
        <CardColumn>
          <FieldLabel>chain_name</FieldLabel>
          <FieldValue>{paymentRequirement?.network ?? 'loaded from Payment-Required'}</FieldValue>
        </CardColumn>
        <CardColumn>
          <FieldLabel>contract_package_hash</FieldLabel>
          <FieldValue>{paymentRequirement ? paymentRequirement.asset : 'loaded from Payment-Required'}</FieldValue>
        </CardColumn>
        <Divider />
        
        <CardTitle>TransferAuthorization</CardTitle>
        {!accountHash && (<CardColumn><FieldLabel>Sign in to view transfer authorization details</FieldLabel></CardColumn>)}
        {accountHash && (<>
          <CardColumn>
            <FieldLabel>from</FieldLabel>
            <FieldValue>{accountHash}</FieldValue>
          </CardColumn>
          <CardColumn>
            <FieldLabel>to</FieldLabel>
            <FieldValue>{paymentRequirement?.payTo ?? 'loaded from Payment-Required'}</FieldValue>
          </CardColumn>
          <CardColumn>
            <FieldLabel>value</FieldLabel>
            <FieldValue>
              {paymentRequirement
                ? formatDisplayAmount(
                    paymentRequirement.amount,
                    paymentRequirement.extra?.decimals,
                    paymentRequirement.extra?.symbol
                  )
                : 'loaded from Payment-Required'}
            </FieldValue>
          </CardColumn>
          <CardColumn>
            <FieldLabel>valid_after</FieldLabel>
            <FieldValue>generated on sign</FieldValue>
          </CardColumn>
          <CardColumn>
            <FieldLabel>valid_before</FieldLabel>
            <FieldValue>generated on sign</FieldValue>
          </CardColumn>
          <CardColumn>
            <FieldLabel>nonce</FieldLabel>
            <FieldValue>generated on sign</FieldValue>
          </CardColumn>
        </>)}
      </Card>
      <Card>
        <CardTitle>Resource</CardTitle>      
        <CardColumn>
          <FieldLabel>Url</FieldLabel>
          <FieldValue>{resourceUrl}</FieldValue>
        </CardColumn>
      </Card>

      <FlexRow gap={20} wrap="wrap">
        <Button color="primaryBlue" disabled={!accountHash} onClick={handleSignTypedData}>
          Get paid resource
        </Button>
      </FlexRow>

      <ResultTextarea
        readOnly
        placeholder="Facilitator /verify response will appear here…"
        value={verifyResult}
      />
      {paymentResponse && (
        <>
          <CardTitle style={{ marginTop: '16px' }}>Payment Response</CardTitle>
          <ResultTextarea
            readOnly
            placeholder="PAYMENT-RESPONSE header will appear here…"
            value={paymentResponse}
          />
        </>
      )}
    </FlexColumn>
  );
}
