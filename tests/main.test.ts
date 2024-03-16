/*
 * Copyright Fluidware srl
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import * as assert from 'assert';
import { MariaDBContainer, StartedMariaDBContainer } from './testcontainers/mariadb';
import { getLogger } from '@fluidware-it/saddlebag';
import { AtuinServer } from '../src/server';
import { Settings } from '../src/Settings';
import { setMailerTransporter } from '../src/helper/mailerHelper';
import { createTransport } from 'nodemailer';
import { setTimeout } from 'timers/promises';

function cleanEnvVars(envs: string[]) {
  envs.forEach(env => {
    delete process.env[env];
  });
}

const adminToken = 'natuin_test_qwertyuiopasdfghjklzxcvbnm123456';

describe('natuin', () => {
  jest.setTimeout(60_000);
  let container: StartedMariaDBContainer;
  let server: AtuinServer;
  let port: number;
  const requiredEnvVars = ['ATUIN_DB_NAME', 'ATUIN_DB_HOST', 'ATUIN_DB_PORT', 'ATUIN_DB_USERNAME', 'ATUIN_DB_PASSWORD'];

  beforeAll(async () => {
    container = await new MariaDBContainer().start();
    process.env.ATUIN_DB_NAME = container.getDatabase();
    process.env.ATUIN_DB_HOST = container.getHost();
    process.env.ATUIN_DB_PORT = container.getPort() + '';
    process.env.ATUIN_DB_USERNAME = container.getUsername();
    process.env.ATUIN_DB_PASSWORD = container.getUserPassword();
  });

  afterAll(async () => {
    await container?.stop();
    if (server) {
      await server.stop();
    }
    cleanEnvVars(requiredEnvVars);
  });

  describe('migration', () => {
    it('should init db without seeding admin', async () => {
      const { migrate } = await import('../src/runMigration');
      const { CURRENT_SCHEMA_VERSION } = await import('../src/db/migrate');
      await migrate(getLogger());
      const res = await container.executeQuery(`select value from ${container.getDatabase()}._version`);
      assert.strictEqual(Number(res.split('\n')[1].trim()), CURRENT_SCHEMA_VERSION);
      const resAdmin = await container.executeQuery(`select count(*) count from ${container.getDatabase()}.users`);
      assert.strictEqual(Number(resAdmin.split('\n')[1].trim()), 0);
    });
    it('should init db with seeding admin - throwing an error since token is not valid', async () => {
      const { migrate } = await import('../src/runMigration');
      const { CURRENT_SCHEMA_VERSION } = await import('../src/db/migrate');
      Settings.adminToken = 'bum';
      await assert.rejects(migrate(getLogger()));
    });
    it('should init db with seeding admin (create)', async () => {
      const { migrate } = await import('../src/runMigration');
      Settings.adminToken = 'natuin_testa_something';
      await migrate(getLogger());
      const resAdmin = await container.executeQuery(`select count(*) count from ${container.getDatabase()}.users`);
      assert.strictEqual(Number(resAdmin.split('\n')[1].trim()), 1);
    });
    it('should init db with seeding admin (update by hash)', async () => {
      const { migrate } = await import('../src/runMigration');
      Settings.adminToken = 'natuin_testa_somethingelse';
      await migrate(getLogger());
      const resAdmin = await container.executeQuery(`select count(*) count from ${container.getDatabase()}.users`);
      assert.strictEqual(Number(resAdmin.split('\n')[1].trim()), 1);
    });
    it('should init db with seeding admin (update)', async () => {
      const { migrate } = await import('../src/runMigration');
      Settings.adminToken = adminToken;
      await migrate(getLogger());
      const resAdmin = await container.executeQuery(`select shortToken from ${container.getDatabase()}.tokens`);
      assert.strictEqual(resAdmin.split('\n')[1].trim(), 'test');
    });

    describe('server', () => {
      let server: AtuinServer;
      let port: number;
      let userToken: string | null = null;

      beforeAll(async () => {
        server = new AtuinServer({
          port: 0
        });
        const ret = await server.start();
        port = ret.port;
      });
      afterAll(async () => {
        await server.stop();
      });

      it('should expose a health check endpoint', async () => {
        const res = await fetch(`http://127.0.0.1:${port}/healthz`);
        assert.strictEqual(res.status, 200);
      });
      describe('check protected urls', () => {
        const url = ['/sync/count', '/sync/status', '/account/me', '/account/tokens'];
        url.forEach(u => {
          it(`should refuse to access ${u} without authorization header`, async () => {
            const res = await fetch(`http://127.0.0.1:${port}${u}`);
            assert.strictEqual(res.status, 401);
          });
          it(`should refuse to access ${u} with wrong authorization token type`, async () => {
            const res = await fetch(`http://127.0.0.1:${port}${u}`, {
              headers: {
                authorization: 'bearer this_fake_token'
              }
            });
            assert.strictEqual(res.status, 401);
          });
          it(`should refuse to access ${u} with wrong authorization token format`, async () => {
            const res = await fetch(`http://127.0.0.1:${port}${u}`, {
              headers: {
                authorization: 'token qwertyuiopasdfghjklzxcvbnm123456'
              }
            });
            assert.strictEqual(res.status, 401);
          });
          it(`should refuse to access ${u} with invalid token`, async () => {
            const res = await fetch(`http://127.0.0.1:${port}${u}`, {
              headers: {
                authorization: 'token this_fake_token'
              }
            });
            assert.strictEqual(res.status, 401);
          });
        });
      });
      describe('registration closed', () => {
        it('should refuse to register a user', async () => {
          const url = `http://127.0.0.1:${port}/register`;
          const res = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              email: 'test@test.com',
              username: 'test',
              password: 'testComplexPassword99'
            })
          });
          const body = await res.json();
          assert.strictEqual(res.status, 400);
          assert.strictEqual(body.reason, 'this server is not open for registrations');
        });
      });
      describe('registration open - max password complexity', () => {
        const defaultPasswordValidation = structuredClone(Settings.passwordValidation);
        beforeAll(() => {
          Settings.openRegistration = true;
          Settings.passwordValidation = {
            minLength: 32,
            requireLowercase: true,
            requireUppercase: true,
            requireNumber: true,
            requireSpecial: true
          };
        });
        afterAll(() => {
          Settings.openRegistration = false;
          Settings.passwordValidation = defaultPasswordValidation;
        });
        it('should refuse to register a user if password does not match the required complexity (min length)', async () => {
          const url = `http://127.0.0.1:${port}/register`;
          const res = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              email: 'testfail@example.com',
              username: 'exampleuser',
              password: 'easy'
            })
          });
          const body = await res.json();
          assert.strictEqual(res.status, 400);
        });
        it('should refuse to register a user if password does not match the required complexity (lowercase char)', async () => {
          const url = `http://127.0.0.1:${port}/register`;
          const res = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              email: 'testfail@example.com',
              username: 'exampleuser',
              password: '1234567890ABCDEFGHJKLMNOPQRSTUVWXYZ!@#$%^&*()' // no lowercase
            })
          });
          const body = await res.json();
          assert.strictEqual(res.status, 400);
        });
        it('should refuse to register a user if password does not match the required complexity (uppercase char)', async () => {
          const url = `http://127.0.0.1:${port}/register`;
          const res = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              email: 'testfail@example.com',
              username: 'exampleuser',
              password: '1234567890abcdefghjklmnopqrstuvwxyz!@#$%^&*()' // no uppercase
            })
          });
          const body = await res.json();
          assert.strictEqual(res.status, 400);
        });
        it('should refuse to register a user if password does not match the required complexity (number)', async () => {
          const url = `http://127.0.0.1:${port}/register`;
          const res = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              email: 'testfail@example.com',
              username: 'exampleuser',
              password: 'ABCDEFGHJKLMNOPQRSTUVWXYZabcdefghjklmnopqrstuvwxyz!@#$%^&*()' // no number
            })
          });
          const body = await res.json();
          assert.strictEqual(res.status, 400);
        });
        it('should refuse to register a user if password does not match the required complexity (special char)', async () => {
          const url = `http://127.0.0.1:${port}/register`;
          const res = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              email: 'testfail@example.com',
              username: 'exampleuser',
              password: '1234567890ABCDEFGHJKLMNOPQRSTUVWXYZabcdefghjklmnopqrstuvwxyz' // no number
            })
          });
          const body = await res.json();
          assert.strictEqual(res.status, 400);
        });
      });
      describe('registration open', () => {
        beforeAll(() => {
          Settings.openRegistration = true;
        });
        afterAll(() => {
          Settings.openRegistration = false;
        });
        it('should refuse to register a user with a reserved username', async () => {
          const url = `http://127.0.0.1:${port}/register`;
          const res = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              email: 'test@example.com',
              username: 'me',
              password: 'anotherTestComplexPassword99'
            })
          });
          await res.json();
          assert.strictEqual(res.status, 400);
        });
        it('should refuse to register a user if request is authenticated and made by non-admin user', async () => {
          const url = `http://127.0.0.1:${port}/register`;
          const res = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              email: 'test@example.com',
              username: 'exampleuser',
              password: 'anotherTestComplexPassword99'
            })
          });
          const body = await res.json();
          assert.strictEqual(res.status, 200);
          const res2 = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              authorization: `Token ${body.session}`
            },
            body: JSON.stringify({
              email: 'test2@example.com',
              username: 'exampleuser2',
              password: 'anotherTestComplexPassword99'
            })
          });
          await res2.json();
          assert.strictEqual(res2.status, 400);
          await fetch(`http://127.0.0.1:${port}/account`, {
            method: 'DELETE',
            headers: {
              authorization: `Token ${body.session}`
            }
          });
        });
        it('should allow to register a user, call /account/me, check tokens and delete itself', async () => {
          const url = `http://127.0.0.1:${port}/register`;
          const res = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              email: 'test@example.com',
              username: 'exampleuser',
              password: 'anotherTestComplexPassword99'
            })
          });
          const body = await res.json();
          assert.strictEqual(res.status, 200);
          assert.ok('session' in body);

          const res2 = await fetch(`http:///127.0.0.1:${port}/account/me`, {
            headers: {
              Authorization: `Token ${body.session}`
            }
          });
          const body2 = await res2.json();
          assert.strictEqual(res2.status, 200);
          assert.strictEqual(body2.username, 'exampleuser');

          const resTokens = await fetch(`http:///127.0.0.1:${port}/account/tokens`, {
            headers: {
              Authorization: `Token ${body.session}`
            }
          });
          const bodyTokens = await resTokens.json();
          assert.strictEqual(resTokens.status, 200);
          assert.strictEqual(bodyTokens.length, 1);

          const resDelete = await fetch(`http:///127.0.0.1:${port}/account`, {
            method: 'DELETE',
            headers: {
              Authorization: `Token ${body.session}`
            }
          });
          assert.strictEqual(res2.status, 200);
        });
        it('an admin should check for an account', async () => {
          const url = `http://127.0.0.1:${port}/register`;
          const res = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              email: 'test@example.com',
              username: 'exampleuser',
              password: 'anotherTestComplexPassword99'
            })
          });
          const body = await res.json();
          assert.strictEqual(res.status, 200);
          assert.ok('session' in body);

          const res2 = await fetch(`http:///127.0.0.1:${port}/account/exampleuser`, {
            headers: {
              Authorization: `Token ${adminToken}`
            }
          });
          const body2 = await res2.json();
          assert.strictEqual(res2.status, 200);
          assert.strictEqual(body2.username, 'exampleuser');

          const resDelete = await fetch(`http:///127.0.0.1:${port}/account/exampleuser`, {
            method: 'DELETE',
            headers: {
              Authorization: `Token ${adminToken}`
            }
          });
          assert.strictEqual(res2.status, 200);

          const res3 = await fetch(`http:///127.0.0.1:${port}/account/exampleuser`, {
            headers: {
              Authorization: `Token ${adminToken}`
            }
          });
          const body3 = await res3.json();
          assert.strictEqual(res3.status, 404);
        });
        describe('with blacklist', () => {
          beforeAll(() => {
            Settings.emailDomainsBlacklist = ['test.com'];
          });
          afterAll(() => {
            Settings.emailDomainsBlacklist = [];
          });
          it('should refuse to register a user with a blacklisted domain', async () => {
            const url = `http://127.0.0.1:${port}/register`;
            const res = await fetch(url, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                email: 'test@test.com',
                username: 'test',
                password: 'testComplexPassword99'
              })
            });
            const body = await res.json();
            assert.strictEqual(res.status, 400);
            assert.strictEqual(body.reason, 'this server is not open for registrations');
          });
          it('should allow to register a user with a non blacklisted domain', async () => {
            const url = `http://127.0.0.1:${port}/register`;
            const res = await fetch(url, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                email: 'test@anothertest.com',
                username: 'anothertest',
                password: 'anotherTestComplexPassword99'
              })
            });
            const body = await res.json();
            assert.strictEqual(res.status, 200);
            assert.ok('session' in body);
          });
        });
        describe('with whitelist', () => {
          beforeAll(() => {
            Settings.emailDomainsWhitelist = ['test.com'];
          });
          afterAll(() => {
            Settings.emailDomainsWhitelist = [];
          });
          it('should refuse to register a user with a non whitelisted domain', async () => {
            const url = `http://127.0.0.1:${port}/register`;
            const res = await fetch(url, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                email: 'test@anothertest.com',
                username: 'test',
                password: 'testComplexPassword99'
              })
            });
            const body = await res.json();
            assert.strictEqual(res.status, 400);
            assert.strictEqual(body.reason, 'this server is not open for registrations');
          });
          it('should allow to register a user with a whitelisted domain', async () => {
            const url = `http://127.0.0.1:${port}/register`;
            const res = await fetch(url, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                email: 'test2@test.com',
                username: 'test2',
                password: 'anotherTestComplexPassword99'
              })
            });
            const body = await res.json();
            assert.strictEqual(res.status, 200);
            assert.ok('session' in body);
          });
        });
      });
      it('should allow an admin to register a user', async () => {
        const res = await fetch(`http://127.0.0.1:${port}/register`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Token ${adminToken}`
          },
          body: JSON.stringify({
            email: 'test@test.com',
            username: 'test',
            password: 'testComplexPassword99'
          })
        });
        const body = await res.json();
        assert.strictEqual(res.status, 200);
        assert.ok('session' in body);
      });
      it('should allow login', async () => {
        const url = `http://127.0.0.1:${port}/login`;
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            username: 'test',
            password: 'testComplexPassword99'
          })
        });
        const body = await res.json();
        assert.strictEqual(res.status, 200);
        assert.ok('session' in body);
        userToken = body.session;
      });
      it('should deny normal user to get /account/{user}', async () => {
        const url = `http://127.0.0.1:${port}/account/test`;
        const res = await fetch(url, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            authorization: `Token ${userToken}`
          }
        });
        await res.json();
        assert.strictEqual(res.status, 403);
      });
      it('should deny normal user to delete other users', async () => {
        const url = `http://127.0.0.1:${port}/account/testanother`;
        const res = await fetch(url, {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            authorization: `Token ${userToken}`
          }
        });
        await res.json();
        assert.strictEqual(res.status, 403);
      });
      it('should deny double login', async () => {
        const url = `http://127.0.0.1:${port}/login`;
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Token ${userToken}`
          },
          body: JSON.stringify({
            username: 'test',
            password: 'testComplexPassword99'
          })
        });
        const body = await res.json();
        assert.strictEqual(res.status, 400);
      });
      it('should not allow to delete the current token', async () => {
        const short = userToken?.split('_')[1];
        const url = `http://127.0.0.1:${port}/account/tokens/${short}`;
        const ret = await fetch(url, {
          method: 'DELETE',
          headers: {
            Authorization: `Token ${userToken}`
          }
        });
        assert.strictEqual(ret.status, 400);
      });
      it('should not allow to delete an existing token', async () => {
        const url = `http://127.0.0.1:${port}/login`;
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            username: 'test',
            password: 'testComplexPassword99'
          })
        });
        const body = await res.json();
        const anotherToken = body.session;
        const short = anotherToken.split('_')[1];
        const urlToDelete = `http://127.0.0.1:${port}/account/tokens/${short}`;
        const ret = await fetch(urlToDelete, {
          method: 'DELETE',
          headers: {
            Authorization: `Token ${userToken}`
          }
        });
        assert.strictEqual(ret.status, 200);
      });
      it('should allow a logged user to get sync count', async () => {
        const url = `http://127.0.0.1:${port}/sync/count`;
        const res = await fetch(url, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Token ${userToken}`
          }
        });
        const body = await res.json();
        assert.strictEqual(res.status, 200);
        assert.strictEqual(body.count, 0);
      });
      it('should allow a logged user to get sync status', async () => {
        const url = `http://127.0.0.1:${port}/sync/status`;
        const res = await fetch(url, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Token ${userToken}`
          }
        });
        const body = await res.json();
        assert.strictEqual(res.status, 200);
        assert.strictEqual(body.count, 0);
        assert.strictEqual(body.deleted.length, 0);
      });
      it('should allow a logged user to post history', async () => {
        async function getHistoryCount() {
          const urlCount = `http://127.0.0.1:${port}/sync/count`;
          const resCount = await fetch(urlCount, {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Token ${userToken}`
            }
          });
          const bodyCount = await resCount.json();
          return bodyCount.count;
        }
        async function getTotalCount() {
          const urlTotalCount = `http://127.0.0.1:${port}/`;
          const resTotalCount = await fetch(urlTotalCount, {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Token ${userToken}`
            }
          });
          const bodyTotalCount = await resTotalCount.json();
          return bodyTotalCount.total_history;
        }
        const preCount = await getHistoryCount();
        const preTotalCount = await getTotalCount();
        const url = `http://127.0.0.1:${port}/history`;
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Token ${userToken}`
          },
          body: JSON.stringify([
            {
              id: 'clientId1',
              timestamp: '2024-03-10T02:22:17.946Z',
              data: 'encrypted-history',
              hostname: 'hostname1'
            }
          ])
        });
        const body = await res.text();
        assert.strictEqual(res.status, 200);

        const postCount = await getHistoryCount();
        const postTotalCount = await getTotalCount();

        assert.strictEqual(postCount, preCount + 1);
        assert.strictEqual(postTotalCount, preTotalCount + 1);
      });
      it('should allow a logged user to post history (duplicate id)', async () => {
        async function getHistoryCount() {
          const urlCount = `http://127.0.0.1:${port}/sync/count`;
          const resCount = await fetch(urlCount, {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Token ${userToken}`
            }
          });
          const bodyCount = await resCount.json();
          return bodyCount.count;
        }
        async function getTotalCount() {
          const urlTotalCount = `http://127.0.0.1:${port}/`;
          const resTotalCount = await fetch(urlTotalCount, {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Token ${userToken}`
            }
          });
          const bodyTotalCount = await resTotalCount.json();
          return bodyTotalCount.total_history;
        }
        const preCount = await getHistoryCount();
        const preTotalCount = await getTotalCount();
        const url = `http://127.0.0.1:${port}/history`;
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Token ${userToken}`
          },
          body: JSON.stringify([
            {
              id: 'clientId1',
              timestamp: '2024-03-10T02:22:17.946Z',
              data: 'encrypted-history',
              hostname: 'hostname1'
            }
          ])
        });
        const body = await res.text();
        assert.strictEqual(res.status, 200);

        const postCount = await getHistoryCount();
        const postTotalCount = await getTotalCount();

        assert.strictEqual(postCount, preCount);
        assert.strictEqual(postTotalCount, preTotalCount);
      });
      it('should return history from other hosts', async () => {
        const url = new URL(`http://127.0.0.1:${port}/sync/history`);
        url.searchParams.set('host', 'hostname2');
        url.searchParams.set('sync_ts', '2024-03-10T02:22:17.000Z');
        url.searchParams.set('history_ts', '1970-01-01T00:00:00Z');
        const res = await fetch(url, {
          headers: {
            Authorization: `Token ${userToken}`
          }
        });
        const body = await res.json();
        assert.strictEqual(res.status, 200);
        assert.strictEqual(body.history.length, 1);
        assert.strictEqual(typeof body.history[0], 'string');
        assert.strictEqual(body.history[0], 'encrypted-history');
      });

      it('should return history stats', async () => {
        const url = new URL(`http://127.0.0.1:${port}/sync/calendar/day?year=2024&month=3`);
        const res = await fetch(url, {
          headers: {
            Authorization: `Token ${userToken}`
          }
        });
        const body = await res.json();
        assert.strictEqual(res.status, 200);
        assert.strictEqual(body['10'].count, 1);
      });

      it('should return history stats for a specific timezone', async () => {
        const url = new URL(`http://127.0.0.1:${port}/sync/calendar/day?year=2024&month=3`);
        url.searchParams.set('tz', 'Pacific/Honolulu');
        const res = await fetch(url, {
          headers: {
            Authorization: `Token ${userToken}`
          }
        });
        const body = await res.json();
        assert.strictEqual(res.status, 200);
        assert.strictEqual(body['9'].count, 1);
      });

      it('should allow to delete a history', async () => {
        const url = `http://localhost:${port}/history`;
        await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Token ${userToken}`
          },
          body: JSON.stringify([
            {
              id: 'clientId2',
              timestamp: '2024-03-10T02:22:18.946Z',
              data: 'encrypted-history',
              hostname: 'hostname1'
            }
          ])
        });
        const res = await fetch(url, {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Token ${userToken}`
          },
          body: JSON.stringify({
            client_id: 'clientId2'
          })
        });
        assert.strictEqual(res.status, 200);
        const urlSync = `http://localhost:${port}/sync/status`;
        const resSync = await fetch(urlSync, {
          headers: {
            Authorization: `Token ${userToken}`
          }
        });
        const bodySync = await resSync.json();
        assert.strictEqual(resSync.status, 200);
        assert.strictEqual(bodySync.count, 2);
        assert.strictEqual(bodySync.deleted.length, 1);
      });

      describe('change password', () => {
        let token = '';
        beforeAll(async () => {
          Settings.openRegistration = true;
          const res = await fetch(`http://127.0.0.1:${port}/register`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              email: 'testpassword@example.com',
              username: 'testpassworduser',
              password: 'first1ComplexPassword'
            })
          });
          const body = await res.json();
          assert.strictEqual(res.status, 200);
          token = body.session;
        });
        afterAll(async () => {
          Settings.openRegistration = false;
          await fetch(`http://127.0.0.1:${port}/account`, {
            method: 'DELETE',
            headers: {
              Authorization: `Token ${token}`
            }
          });
        });
        it('should correctly handle change password flow', async () => {
          const urlPassword = `http://127.0.0.1:${port}/account/password`;
          let res = await fetch(urlPassword, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Token ${token}`
            },
            body: JSON.stringify({
              current_password: 'wrongpassword',
              new_password: 'secondComplexP4ssword'
            })
          });
          await res.json();
          assert.strictEqual(res.status, 403);
          res = await fetch(urlPassword, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Token ${token}`
            },
            body: JSON.stringify({
              current_password: 'first1ComplexPassword',
              new_password: 'secondComplexP4ssword'
            })
          });
          await res.text();
          assert.strictEqual(res.status, 200);
          res = await fetch(`http://127.0.0.1:${port}/login`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              username: 'testpassworduser',
              password: 'secondComplexP4ssword'
            })
          });
          const loginBody = await res.json();
          assert.strictEqual(res.status, 200);
          assert.ok('session' in loginBody);
        });
      });

      describe('email validation', () => {
        let token = '';
        let from = '';
        let to = '';
        let message = '';
        const user = {
          email: 'testvalidationemail@example.com',
          username: 'testpassworduser',
          password: 'first1ComplexPassword'
        };
        beforeAll(async () => {
          const transporter = createTransport({
            jsonTransport: true
          });
          setMailerTransporter(transporter, (err, info) => {
            from = info.envelope.from;
            to = info.envelope.to[0];
            message = info.message;
          });
          Settings.openRegistration = true;
          Settings.emailFrom = 'sender@test.com';
          Settings.emailRegistrationValidation = true;
          const res = await fetch(`http://127.0.0.1:${port}/register`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(user)
          });
          const body = await res.json();
          assert.strictEqual(res.status, 200);
          token = body.session;
        });
        afterAll(async () => {
          Settings.openRegistration = false;
          Settings.emailFrom = '';
          Settings.emailRegistrationValidation = false;
          await fetch(`http://127.0.0.1:${port}/account`, {
            method: 'DELETE',
            headers: {
              Authorization: `Token ${token}`
            }
          });
        });
        it('should send an email with a validation link', async () => {
          await setTimeout(50);
          assert.strictEqual(from, 'sender@test.com');
          assert.strictEqual(to, 'testvalidationemail@example.com');
          assert.ok(message.includes('Hello testpassworduser!'));
          const regex = /Your validation code is (.*?)\\n/;
          const match = message.match(regex);
          const validationCode = match ? match[1] : null;
          assert.ok(validationCode);
          const htmlFormReq = await fetch(`http://localhost:${port}/account/validate`);
          await htmlFormReq.text();
          const resp = await fetch(`http://localhost:${port}/account/validate`, {
            method: 'POST',
            headers: {
              'content-type': 'application/json'
            },
            body: JSON.stringify({
              username: 'testpassworduser',
              password: 'first1ComplexPassword',
              code: validationCode
            })
          });
          assert.strictEqual(resp.status, 200);
        });
        it('should refuse to validate an account with an invalid code', async () => {
          const resp = await fetch(`http://localhost:${port}/account/validate`, {
            method: 'POST',
            headers: {
              'content-type': 'application/json'
            },
            body: JSON.stringify({
              username: 'testpassworduser',
              password: 'first1ComplexPassword',
              code: 'invalidcode'
            })
          });
          assert.strictEqual(resp.status, 400);
        });
      });
      describe('password reset', () => {
        let token = '';
        const user = {
          email: 'testresetpassword@example.com',
          username: 'testresetpassworduser',
          password: 'first1ComplexPassword'
        };
        beforeAll(async () => {
          Settings.openRegistration = true;
          const res = await fetch(`http://127.0.0.1:${port}/register`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(user)
          });
          const body = await res.json();
          assert.strictEqual(res.status, 200);
          token = body.session;
        });
        afterAll(async () => {
          Settings.openRegistration = false;
          await fetch(`http://127.0.0.1:${port}/account`, {
            method: 'DELETE',
            headers: {
              Authorization: `Token ${token}`
            }
          });
        });
        it('should send an email with a reset link', async () => {
          let from = '';
          let to = '';
          let message = '';
          const transporter = createTransport({
            jsonTransport: true
          });
          setMailerTransporter(transporter, (err, info) => {
            from = info.envelope.from;
            to = info.envelope.to[0];
            message = info.message;
          });
          const url = `http://localhost:${port}/account/forgot-password`;
          let res = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              email: user.email,
              username: user.username
            })
          });
          const body = await res.json();
          assert.strictEqual(res.status, 200);
          // timeout?
          await setTimeout(50);
          assert.strictEqual(to, user.email);
          assert.ok(message.includes(`Hello ${user.username}!`));
          const regex = /Your reset code is\\n\\n(.*?)\\n/;
          const match = message.match(regex);
          const validationCode = match ? match[1] : null;
          assert.ok(validationCode);
          res = await fetch(`http://localhost:${port}/account/reset-password`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              code: validationCode,
              password: 'newComplexPassword99'
            })
          });
          await res.json();
          assert.strictEqual(res.status, 200);
          // login with new password
          res = await fetch(`http://localhost:${port}/login`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              username: user.username,
              password: 'newComplexPassword99'
            })
          });
          await res.json();
          assert.strictEqual(res.status, 200);
          // login must fail with old password
          res = await fetch(`http://localhost:${port}/login`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              username: user.username,
              password: user.password
            })
          });
          await res.json();
          assert.strictEqual(res.status, 403);
          // validation code must be invalid
          res = await fetch(`http://localhost:${port}/account/reset-password`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              code: validationCode,
              password: 'extraComplexPassword123'
            })
          });
          await res.json();
          assert.strictEqual(res.status, 400);
        });
        it('a new forget password request should override the previous one', async () => {
          let from = '';
          let to = '';
          let message = '';
          const transporter = createTransport({
            jsonTransport: true
          });
          setMailerTransporter(transporter, (err, info) => {
            from = info.envelope.from;
            to = info.envelope.to[0];
            message = info.message;
          });
          const url = `http://localhost:${port}/account/forgot-password`;
          let res = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              email: user.email,
              username: user.username
            })
          });
          const body = await res.json();
          assert.strictEqual(res.status, 200);
          await setTimeout(50);
          assert.strictEqual(to, user.email);
          assert.ok(message.includes(`Hello ${user.username}!`));
          const regex = /Your reset code is\\n\\n(.*?)\\n/;
          const match = message.match(regex);
          const firstValidationCode = match ? match[1] : null;
          assert.ok(firstValidationCode);
          res = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              email: user.email,
              username: user.username
            })
          });
          const body2 = await res.json();
          assert.strictEqual(res.status, 200);
          await setTimeout(50);
          assert.strictEqual(to, user.email);
          assert.ok(message.includes(`Hello ${user.username}!`));
          const match2 = message.match(regex);
          const secondValidationCode = match2 ? match2[1] : null;
          assert.ok(secondValidationCode);
          // reset with the first code must fail
          res = await fetch(`http://localhost:${port}/account/reset-password`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              code: firstValidationCode,
              password: 'newComplexPassword99'
            })
          });
          await res.json();
          assert.strictEqual(res.status, 400);
          // reset with the second code must succeed
          res = await fetch(`http://localhost:${port}/account/reset-password`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              code: secondValidationCode,
              password: 'newComplexPassword992'
            })
          });
          await res.json();
          assert.strictEqual(res.status, 200);
          // login with new password
          res = await fetch(`http://localhost:${port}/login`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              username: user.username,
              password: 'newComplexPassword992'
            })
          });
          await res.json();
          assert.strictEqual(res.status, 200);
        });
      });
      describe('user block/unblock', () => {
        let token = '';
        const user = {
          email: 'testblock@example.com',
          username: 'testblock',
          password: 'first1ComplexPassword'
        };
        beforeAll(async () => {
          Settings.openRegistration = true;
          const res = await fetch(`http://127.0.0.1:${port}/register`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(user)
          });
          const body = await res.json();
          assert.strictEqual(res.status, 200);
          token = body.session;
        });
        afterAll(async () => {
          Settings.openRegistration = false;
          await fetch(`http://127.0.0.1:${port}/account`, {
            method: 'DELETE',
            headers: {
              Authorization: `Token ${token}`
            }
          });
        });
        it('should return an error if block is called by non admin', async () => {
          const res = await fetch(`http://127.0.0.1:${port}/account/${user.username}/block`, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              authorization: `Token ${token}`
            }
          });
          assert.strictEqual(res.status, 403);
        });
        it('should block a user', async () => {
          const res = await fetch(`http://127.0.0.1:${port}/account/${user.username}/block`, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              authorization: `Token ${adminToken}`
            }
          });
          assert.strictEqual(res.status, 200);
          // login must fail
          const res2 = await fetch(`http://127.0.0.1:${port}/login`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              username: user.username,
              password: user.password
            })
          });
          assert.strictEqual(res2.status, 403);
          // token must be blocked
          const res2bis = await fetch(`http://127.0.0.1:${port}/account/me`, {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
              authorization: `Token ${token}`
            }
          });
          assert.strictEqual(res2bis.status, 403);
          // unblock
          await fetch(`http://127.0.0.1:${port}/account/${user.username}/unblock`, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              authorization: `Token ${adminToken}`
            }
          });
          assert.strictEqual(res.status, 200);
          // login must succeed
          const res4 = await fetch(`http://127.0.0.1:${port}/login`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              username: user.username,
              password: user.password
            })
          });
          assert.strictEqual(res4.status, 200);
        });
      });
    });
  });
});
