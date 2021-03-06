import express from 'express';
import shortid from 'shortid';

import { getDb } from '../database';
import { createToken } from '../helpers/handleToken';
import { generateHash, compareHash } from '../helpers/handleHash';
import { productionConstants } from '../config/constants';
import { authRoutes } from '../config/routes';
import createErrorMessage from '../helpers/createErrorMessage';
import createSuccessMessage from '../helpers/createSuccessMessage';


const route = express.Router();

export const addUser = async (db, collection, { id, email, password }) => {
  try {
    const hashedPassword = await generateHash(password);
    await db.collection(collection)
      .insertOne({
        id,
        email,
        password: hashedPassword,
      });

    return createSuccessMessage();
  } catch (e) {
    return createErrorMessage('[Register]: Caught an error while adding/updating user');
  }
};

export const registerUser = async (db, collection, { id, email, password }) => {
  try {
    const found = await db.collection(collection).count({ email });
    if (found === 0) {
      const response = await addUser(db, collection, { id, email, password });
      return response;
    }
    return createErrorMessage('User exists');
  } catch (e) {
    return createErrorMessage('[Register]: Caught an error while registering user.');
  }
};

export const loginUser = async (db, collection, { email, password }) => {
  try {
    const user = await db.collection(collection)
      .findOne({ email });

    if (user === null) {
      return createErrorMessage('Email entered is incorrect');
    }
    const hashedPassword = user.password;
    const match = await compareHash(password, hashedPassword);

    if (match === false) {
      return createErrorMessage('Password entered is incorrect');
    }

    const token = createToken(user.email);
    return createSuccessMessage('token', token);
  } catch (e) {
    return createErrorMessage('[Login]: Caught an error while getting user from the database.');
  }
};


route.post(authRoutes.Register, async (req, res) => {
  const db = await getDb();
  const collection = productionConstants.USERS_COLLECTION;
  const formData = req.body;

  const id = shortid.generate().toLowerCase();
  const registerResponse = await registerUser(db, collection, { ...formData, id });

  let response;
  if (registerResponse.success === true) {
    const token = createToken(formData.email);
    response = createSuccessMessage('token', token);
  } else {
    response = { errors: registerResponse.errors };
  }
  res.json(response);
});

route.post(authRoutes.Login, async (req, res) => {
  const db = await getDb();
  const collection = productionConstants.USERS_COLLECTION;

  const formData = req.body;

  const response = await loginUser(db, collection, formData);
  res.json(response);
});

export default route;
