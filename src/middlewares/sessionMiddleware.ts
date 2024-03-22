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

import { Request, Response, NextFunction } from 'express';
import { getDbClient } from '../services/ServiceUtils';
import { setAsyncLocalStorageProp } from '@fluidware-it/saddlebag';
import { MicroServiceStoreSymbols } from '@fluidware-it/express-microservice';
import { Token } from '../models/Token';
import { returnError } from '../controllers/ControllersUtils';
import { getTokenComponents } from 'prefixed-api-key';

export async function sessionMiddleware(req: Request, res: Response, next: NextFunction) {
  const authorization = req.get('authorization');
  if (!authorization) {
    return next();
  }
  const parts = authorization.split(' ');
  if (parts[0].trim().toLowerCase() !== 'token') {
    res.status(401).json({ status: 401, reason: 'invalid authorization header encoding' });
    return;
  }
  const token = parts[1]?.trim();
  if (token) {
    const prefixedToken = getTokenComponents(token);
    if (!prefixedToken || !prefixedToken.shortToken) {
      res.status(401).json({ status: 401, reason: 'invalid token format' });
      return;
    }
    try {
      const db = getDbClient();
      const user = await Token.getUserByToken(db, prefixedToken.shortToken, prefixedToken.longTokenHash);
      if (!user) {
        res.status(401).json({ status: 401, reason: 'invalid token' });
        return;
      }
      user.currentToken = prefixedToken.shortToken;
      setAsyncLocalStorageProp(MicroServiceStoreSymbols.CONSUMER, user);
    } catch (e) {
      returnError(e, res);
      return;
    }
  }
  next();
}
