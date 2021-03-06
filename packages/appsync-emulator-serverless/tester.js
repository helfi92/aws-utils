const assert = require('assert');
const { createSchema } = require('./schemaTest');
const createServerCore = require('./serverCore');
const testJWT = require('./testJWT');
const dynamoEmulator = require('@conduitvc/dynamodb-emulator');

let GLOBAL_EMULATOR = null;

async function emulatorSingleton() {
  if (GLOBAL_EMULATOR) {
    return GLOBAL_EMULATOR;
  }
  const emulator = await dynamoEmulator.launch();
  GLOBAL_EMULATOR = emulator;
  return emulator;
}

const create = async ({ serverless, schemaPath, port = 0 } = {}) => {
  // For performance we leverage a single emulator instance per process.
  // To keep things unqiue between runs we use table names which are specific
  // to each invocation of 'create'
  const emulator = await emulatorSingleton();
  const dynamodb = dynamoEmulator.getClient(emulator);

  const {
    pubusb,
    subscriptions,
    schema,
    close: schemaClose,
  } = await createSchema({
    serverless,
    schemaPath,
    dynamodb,
  });
  const { url, mqttServer, mqttURL, server } = await createServerCore({
    port,
    pubusb,
    schema,
    subscriptions,
  });

  const close = () => {
    server.close();
    // schema deletes tables so we must close the emulator after.
    return schemaClose().then(() => emulator.terminate());
  };

  return {
    close,
    url,
    mqttServer,
    mqttURL,
    schema,
    server,
  };
};

const connect = (
  serverConfig,
  AWSAppSyncClient,
  AUTH_TYPE = 'AMAZON_COGNITO_USER_POOLS',
  configs = {},
) => {
  assert(serverConfig.url, 'must have serverConfig with url');
  assert(AWSAppSyncClient, 'must pass AWSAppSyncClient');

  return new AWSAppSyncClient({
    url: serverConfig.url,
    region: 'us-fake-1',
    disableOffline: true,
    auth: {
      type: AUTH_TYPE,
      jwtToken: () => testJWT.string,
    },
    ...configs,
  });
};

module.exports = { create, connect };
