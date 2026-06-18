import './App.css';
import styled from 'styled-components';
import { useEffect, useState } from 'react';
import SignedTypedData from './SignTypedData.tsx';
import Container from './container.tsx';

const GettingStartedContainer = styled.div`
  padding: 0 12px;
  margin: 0 auto;
  max-width: 100%;
  @media (min-width: ${'768px'}) {
    max-width: 960px;
  }
`;

function App() {
  const [activeAccount, setActiveAccount] = useState<any>(null);

  useEffect(() => {
    const scriptId = 'csprclick-script';

    const onSignedIn = async (evt: any) => {
      setActiveAccount(evt.account);
    };
    const onSwitchedAccount = async (evt: any) => {
      setActiveAccount(evt.account);
    };
    const onSignedOut = async () => {
      setActiveAccount(null);
    };
    const onDisconnected = async () => {
      setActiveAccount(null);
    };
    const onUnsolicitedAccountChange = async (evt: any) => {
      window.csprclick.signInWithAccount(evt.account);
    };

    const addListeners = () => {
      window.csprclick?.on('csprclick:signed_in', onSignedIn);
      window.csprclick?.on('csprclick:switched_account', onSwitchedAccount);
      window.csprclick?.on('csprclick:signed_out', onSignedOut);
      window.csprclick?.on('csprclick:disconnected', onDisconnected);
      window.csprclick?.on('csprclick:unsolicited_account_change', onUnsolicitedAccountChange);
    };

    if (!document.getElementById(scriptId)) {
      const script = document.createElement('script');
      script.id = scriptId;
      script.src = 'https://cdn.cspr.click/ui/v2.1.0/csprclick-client-2.1.0.js';
      script.defer = true;
      document.head.appendChild(script);
    }

    window.addEventListener('csprclick:loaded', () => {
      addListeners();
      window.csprclick.appSettings.badge_left = null;
    });

    return () => {
      window.csprclick?.off('csprclick:signed_in', onSignedIn);
      window.csprclick?.off('csprclick:switched_account', onSwitchedAccount);
      window.csprclick?.off('csprclick:signed_out', onSignedOut);
      window.csprclick?.off('csprclick:disconnected', onDisconnected);
      window.csprclick?.off('csprclick:unsolicited_account_change', onUnsolicitedAccountChange);
    };
  }, []);

  return (
    <Container>
      <GettingStartedContainer id={'getting-started'}>
        <SignedTypedData publicKey={activeAccount?.public_key || ''} />
      </GettingStartedContainer>
    </Container>
  );
}

export default App;
