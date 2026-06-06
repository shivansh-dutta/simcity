import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { SpacetimeDBProvider } from 'spacetimedb/react';
import type { Identity } from 'spacetimedb';
import App from './App';
import { DbConnection, type ErrorContext } from './module_bindings';

const STDB_HOST = import.meta.env.VITE_STDB_HOST ?? 'wss://maincloud.spacetimedb.com';
const STDB_MODULE = import.meta.env.VITE_STDB_MODULE;

if (!STDB_MODULE) {
  throw new Error('VITE_STDB_MODULE is required');
}

const TOKEN_KEY = `${STDB_HOST}/${STDB_MODULE}/auth_token`;

const connectionBuilder = DbConnection.builder()
  .withUri(STDB_HOST)
  .withDatabaseName(STDB_MODULE)
  .withToken(localStorage.getItem(TOKEN_KEY) || undefined)
  .onConnect((_conn: DbConnection, identity: Identity, token: string) => {
    localStorage.setItem(TOKEN_KEY, token);
    console.info('Connected to SpacetimeDB:', identity.toHexString());
  })
  .onDisconnect(() => {
    console.info('Disconnected from SpacetimeDB');
  })
  .onConnectError((_ctx: ErrorContext, error: Error) => {
    console.error('SpacetimeDB connection error:', error);
  });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SpacetimeDBProvider connectionBuilder={connectionBuilder}>
      <App />
    </SpacetimeDBProvider>
  </StrictMode>
);
