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

export * from './users';
export * from './history';

export interface PasswordRules {
  minLength: number;
  requireLowercase: boolean;
  requireUppercase: boolean;
  requireNumber: boolean;
  requireSpecial: boolean;
}

export interface NatuinSettings {
  adminToken?: string;
  openRegistration: boolean;
  emailDomainsWhitelist: string[];
  emailDomainsBlacklist: string[];
  emailRegistrationValidation: boolean;
  emailRegistrationValidationTimeout: number;
  sessionTTL: number;
  pageSize: number;
  emailFrom: string;
  smtpSettings?: {
    pool: boolean;
    host: string;
    port: number;
    secure: boolean;
    auth: {
      user?: string;
      pass?: string;
    };
    tls: {
      rejectUnauthorized: boolean;
    };
  };
  passwordValidation: PasswordRules;
}

export interface SynsStats {
  [key: string]: {
    count: number;
  };
}
