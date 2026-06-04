// Set up CSPR.click UI (Top Bar)
//
const uiContainer = 'csprclick-ui';

const defaultTheme = 'light';

const accountMenuItems = [
  'AccountCardMenuItem',
];

const clickUIOptions = {
  uiContainer,
  rootAppElement: '#app',
  defaultTheme,
  accountMenuItems,
};

const clickSDKOptions = {
  appName: 'CSPR.click x402 demo',
  appId: 'csprclick-template',
  providers: ['casper-wallet', 'ledger', 'metamask-snap', 'csprclick-w3a-google']
};
