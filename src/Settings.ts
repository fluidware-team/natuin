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

import { EnvParse } from '@fluidware-it/saddlebag';
import { INVIATION_MODE, NatuinSettings } from './types';
import { humanToMs } from './utils/stringUtils';

function smtpSettings() {
  if (EnvParse.envBool('ATUIN_REGISTRATION_EMAIL_VALIDATION', false)) {
    return {
      pool: EnvParse.envBool('ATUIN_SMTP_POOL', false),
      // ATUIN_SMTP_HOST: the hostname of the SMTP server. required only if ATUIN_REGISTRATION_EMAIL_VALIDATION is true
      host: EnvParse.envStringRequired('ATUIN_SMTP_HOST'),
      port: EnvParse.envInt('ATUIN_SMTP_PORT', 25),
      secure: EnvParse.envBool('ATUIN_SMTP_SECURE', false),
      auth: {
        user: EnvParse.envStringOptional('ATUIN_SMTP_USER'),
        pass: EnvParse.envStringOptional('ATUIN_SMTP_PASSWORD')
      },
      tls: {
        // ATUIN_SMTP_TLS_REJECT_UNAUTHORIZED: do not fail on invalid certs
        rejectUnauthorized: EnvParse.envBool('ATUIN_SMTP_TLS_REJECT_UNAUTHORIZED', true)
      }
    };
  }
}

function checkInvitationMode(mode: string) {
  if (mode === INVIATION_MODE.CLOSE || mode === INVIATION_MODE.OPEN || mode === INVIATION_MODE.ADMIN_ONLY) {
    return mode;
  } else {
    throw new Error('Invalid invitation mode');
  }
}

export const Settings: NatuinSettings = {
  adminToken: EnvParse.envStringOptional('ATUIN_ADMIN_TOKEN'),
  passwordValidation: {
    // ATUIN_PASSWORD_MIN_LENGTH: the minimum length of a password
    minLength: EnvParse.envInt('ATUIN_PASSWORD_MIN_LENGTH', 16),
    // ATUIN_PASSWORD_REQUIRE_LOWERCASE: require at least one lowercase letter
    requireLowercase: EnvParse.envBool('ATUIN_PASSWORD_REQUIRE_LOWERCASE', true),
    // ATUIN_PASSWORD_REQUIRE_UPPERCASE: require at least one uppercase letter
    requireUppercase: EnvParse.envBool('ATUIN_PASSWORD_REQUIRE_UPPERCASE', false),
    // ATUIN_PASSWORD_REQUIRE_NUMBER: require at least one number
    requireNumber: EnvParse.envBool('ATUIN_PASSWORD_REQUIRE_NUMBER', true),
    // ATUIN_PASSWORD_REQUIRE_SPECIAL: require at least one special character
    requireSpecial: EnvParse.envBool('ATUIN_PASSWORD_REQUIRE_SPECIAL', false)
  },
  openRegistration: EnvParse.envBool('ATUIN_OPEN_REGISTRATION', false),
  // ATUIN_INVITATION_MODE: the invitation mode. one of 'close', 'open', 'admin-only'
  invitationMode: checkInvitationMode(EnvParse.envString('ATUIN_INVITATION_MODE', 'close')),
  // ATUIN_REGISTRATION_EMAIL_DOMAINS_WHITELIST: comma separated list of email domains to allow registration
  emailDomainsWhitelist: EnvParse.envStringList<string>('ATUIN_REGISTRATION_EMAIL_DOMAINS_WHITELIST', []).filter(
    d => !!d
  ),
  // ATUIN_REGISTRATION_EMAIL_DOMAINS_BLACKLIST: comma separated list of email domains to disallow registration
  emailDomainsBlacklist: EnvParse.envStringList<string>('ATUIN_REGISTRATION_EMAIL_DOMAINS_BLACKLIST', []).filter(
    d => !!d
  ),
  emailRegistrationValidation: EnvParse.envBool('ATUIN_REGISTRATION_EMAIL_VALIDATION', false),
  emailRegistrationValidationTimeout: humanToMs(
    EnvParse.envString('ATUIN_REGISTRATION_EMAIL_VALIDATION_TIMEOUT', '1d')
  ),
  // ATUIN_EMAIL_FROM: the email address to use as sender. required only if ATUIN_REGISTRATION_EMAIL_VALIDATION is true
  emailFrom: EnvParse.envString('ATUIN_EMAIL_FROM', 'natuin@example.com'),
  smtpSettings: smtpSettings(),
  sessionTTL: EnvParse.envInt('ATUIN_SESSION_TTL_IN_DAYS', 0) * 24 * 60 * 60 * 1000,
  pageSize: EnvParse.envInt('ATUIN_PAGE_SIZE', 1100)
};
