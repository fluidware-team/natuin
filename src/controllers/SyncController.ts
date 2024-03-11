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

import { Request, Response } from 'express';
import { getAsyncLocalStorageProp, getLogger } from '@fluidware-it/saddlebag';
import { HTTPError, MicroServiceStoreSymbols } from '@fluidware-it/express-microservice';
import { getUserFromSession, returnError } from './ControllersUtils';
import { SyncService } from '../services/SyncService';
import { User } from '../types';
import { ATUIN_API_VERSION } from '../Consts';
import { Settings } from '../Settings';
import { Focus } from '../types';

export async function getCount(req: Request, res: Response) {
  const user = getAsyncLocalStorageProp<User>(MicroServiceStoreSymbols.CONSUMER);
  if (!user) {
    returnError(new HTTPError('Not logged in', 401), res);
    return;
  }
  try {
    const count = await SyncService.getCount(user.id);
    res.json({ count });
  } catch (e) {
    returnError(e, res);
  }
}

export async function getHistory(req: Request, res: Response) {
  const user = getUserFromSession();
  const { sync_ts, history_ts, host } = req.query;
  try {
    const history = await SyncService.getHistory(user.id, sync_ts as string, history_ts as string, host as string);
    getLogger().info({ historyCount: history.length }, 'getHistory');
    res.json({ history });
  } catch (e) {
    returnError(e, res);
  }
}

export async function calendar(req: Request, res: Response) {
  const user = getUserFromSession();
  const { focus } = req.params;
  const { year, month, tz } = req.query;
  try {
    const history = await SyncService.getHistoryStats(
      user.id,
      focus as Focus,
      year ? Number(year) : undefined,
      month ? Number(month) : undefined,
      tz as string
    );
    res.json(history);
  } catch (e) {
    returnError(e, res);
  }
}

export async function status(req: Request, res: Response) {
  const user = getUserFromSession();
  const { count, deleted } = await SyncService.getStatus(user.id);
  res.json({
    count,
    username: user.username,
    deleted,
    page_size: Settings.pageSize,
    version: ATUIN_API_VERSION
  });
}
