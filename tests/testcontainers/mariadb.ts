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

import { AbstractStartedContainer, GenericContainer, StartedTestContainer } from 'testcontainers';

const MARIADB_PORT = 3306;

export class MariaDBContainer extends GenericContainer {
  private database = 'atuin';
  private username = 'atuin';
  private userPassword = 'atuin';
  private rootPassword = 'rootwmspwd';

  constructor(image = 'mariadb:11.3.2') {
    super(image);
    this.withExposedPorts(MARIADB_PORT).withStartupTimeout(120_000);
  }

  public withDatabase(database: string): this {
    this.database = database;
    return this;
  }

  public withUsername(username: string): this {
    this.username = username;
    return this;
  }

  public withRootPassword(rootPassword: string): this {
    this.rootPassword = rootPassword;
    return this;
  }

  public withUserPassword(userPassword: string): this {
    this.userPassword = userPassword;
    return this;
  }

  public override async start(): Promise<StartedMariaDBContainer> {
    this.withEnvironment({
      MARIADB_DATABASE: this.database,
      MARIADB_ROOT_PASSWORD: this.rootPassword,
      MARIADB_USER: this.username,
      MARIADB_PASSWORD: this.userPassword
    });
    return new StartedMariaDBContainer(
      await super.start(),
      this.database,
      this.username,
      this.userPassword,
      this.rootPassword
    );
  }
}

export class StartedMariaDBContainer extends AbstractStartedContainer {
  private readonly port: number;

  constructor(
    startedTestContainer: StartedTestContainer,
    private readonly database: string,
    private readonly username: string,
    private readonly userPassword: string,
    private readonly rootPassword: string
  ) {
    super(startedTestContainer);
    this.port = startedTestContainer.getMappedPort(MARIADB_PORT);
  }

  public getPort(): number {
    return this.port;
  }

  public getDatabase(): string {
    return this.database;
  }

  public getUsername(): string {
    return this.username;
  }

  public getUserPassword(): string {
    return this.userPassword;
  }

  public getRootPassword(): string {
    return this.rootPassword;
  }

  public getConnectionUri(isRoot = false): string {
    const url = new URL('', 'mysql://');
    url.hostname = this.getHost();
    url.port = this.getPort().toString();
    url.pathname = this.getDatabase();
    url.username = isRoot ? 'root' : this.getUsername();
    url.password = isRoot ? this.getRootPassword() : this.getUserPassword();
    return url.toString();
  }

  public async executeQuery(query: string, additionalFlags: string[] = []): Promise<string> {
    const result = await this.startedTestContainer.exec([
      'mariadb',
      '-h',
      '127.0.0.1',
      '-u',
      this.username,
      `-p${this.userPassword}`,
      '-e',
      `${query};`,
      ...additionalFlags
    ]);
    if (result.exitCode !== 0) {
      throw new Error(`executeQuery failed with exit code ${result.exitCode} for query: ${query}`);
    }
    return result.output;
  }
}
