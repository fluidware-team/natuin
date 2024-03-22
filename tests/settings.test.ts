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

describe('Settings', () => {
  const requiredEnvVars = ['ATUIN_DB_NAME', 'ATUIN_DB_HOST', 'ATUIN_DB_PORT', 'ATUIN_DB_USERNAME', 'ATUIN_DB_PASSWORD'];

  afterEach(async () => {
    Object.keys(process.env).forEach(key => {
      if (key.startsWith('ATUIN_')) {
        delete process.env[key];
      }
    });
    jest.resetModules();
  });
  it('should return default Settings', async () => {
    const { Settings } = require('../src/Settings');
    assert.deepStrictEqual(Settings, {
      adminToken: undefined,
      emailDomainsBlacklist: [],
      emailDomainsWhitelist: [],
      emailFrom: 'natuin@example.com',
      emailRegistrationValidation: false,
      emailRegistrationValidationTimeout: 86400000,
      maxHistoryDataSize: 32768,
      invitationMode: 'close',
      openRegistration: false,
      pageSize: 1100,
      passwordValidation: {
        minLength: 16,
        requireLowercase: true,
        requireNumber: true,
        requireSpecial: false,
        requireUppercase: false
      },
      sessionTTL: 0,
      smtpSettings: undefined
    });
  });
  it('should return custom Settings', async () => {
    process.env.ATUIN_ADMIN_TOKEN = 'adminToken';
    process.env.ATUIN_REGISTRATION_EMAIL_DOMAINS_BLACKLIST = 'example.com,example.org';
    process.env.ATUIN_REGISTRATION_EMAIL_DOMAINS_WHITELIST = 'example.net,example.it, example.test';
    process.env.ATUIN_EMAIL_FROM = 'test@natuin.io';
    process.env.ATUIN_EMAIL_REGISTRATION_VALIDATION = 'true';
    process.env.ATUIN_REGISTRATION_EMAIL_VALIDATION_TIMEOUT = '2d';
    process.env.ATUIN_INVITATION_MODE = 'open';
    process.env.ATUIN_OPEN_REGISTRATION = 'true';
    process.env.ATUIN_REGISTRATION_EMAIL_VALIDATION = 'true';
    process.env.ATUIN_PAGE_SIZE = '100';
    process.env.ATUIN_PASSWORD_MIN_LENGTH = '8';
    process.env.ATUIN_PASSWORD_REQUIRE_LOWERCASE = 'false';
    process.env.ATUIN_PASSWORD_REQUIRE_NUMBER = 'false';
    process.env.ATUIN_PASSWORD_REQUIRE_SPECIAL = 'true';
    process.env.ATUIN_PASSWORD_REQUIRE_UPPERCASE = 'true';
    process.env.ATUIN_SESSION_TTL_IN_DAYS = '3';
    process.env.ATUIN_SMTP_POOL = 'true';
    process.env.ATUIN_SMTP_HOST = 'smtp.example.com';
    process.env.ATUIN_SMTP_PASSWORD = 'password';
    process.env.ATUIN_SMTP_PORT = '587';
    process.env.ATUIN_SMTP_SECURE = 'true';
    process.env.ATUIN_SMTP_TLS_REJECT_UNAUTHORIZED = 'false';
    process.env.ATUIN_SMTP_USER = 'user';
    process.env.ATUIN_SMTP_TLS_REJECT_UNAUTHORIZED = 'false';
    process.env.ATUIN_MAX_HISTORY_DATA_SIZE = '1024';
    const { Settings } = require('../src/Settings');
    assert.deepStrictEqual(Settings, {
      adminToken: 'adminToken',
      emailDomainsBlacklist: ['example.com', 'example.org'],
      emailDomainsWhitelist: ['example.net', 'example.it', 'example.test'],
      emailFrom: 'test@natuin.io',
      emailRegistrationValidation: true,
      emailRegistrationValidationTimeout: 172800000,
      invitationMode: 'open',
      openRegistration: true,
      maxHistoryDataSize: 1024,
      pageSize: 100,
      passwordValidation: {
        minLength: 8,
        requireLowercase: false,
        requireNumber: false,
        requireSpecial: true,
        requireUppercase: true
      },
      sessionTTL: 3 * 24 * 60 * 60 * 1000,
      smtpSettings: {
        auth: {
          user: 'user',
          pass: 'password'
        },
        host: 'smtp.example.com',
        pool: true,
        port: 587,
        secure: true,
        tls: {
          rejectUnauthorized: false
        }
      }
    });
  });
  it('should throw an error if invitation mode is invalid', async () => {
    process.env.ATUIN_INVITATION_MODE = 'xxxx';
    assert.throws(() => {
      require('../src/Settings');
    }, /Invalid invitation mode/);
  });
});
