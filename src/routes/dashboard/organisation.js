import express from 'express';

import { getDb } from '../../database';
import { productionConstants } from '../../config/constants';
import getUserID from '../../helpers/getUserID';
import organisationHelper from '../../helpers/handleOrganisation';
import { organisationRoutes } from '../../config/routes';
import getOwnerID from '../../helpers/getOrgOwnerID';
import createErrorMessage from '../../helpers/createErrorMessage';
import createSuccessMessage from '../../helpers/createSuccessMessage';
import { getWakaTimeTokenFromEmail } from './wakatime';
import mailer from '../../config/mailerConfig';
import createInviteToken from '../../helpers/createInviteToken';
import getMailContentInHTML from '../../helpers/getMailContentInHTML';


const route = express.Router();
const {
  registerOrganisation,
  listOrganisations,
} = organisationHelper;

export const getOrg = async (db, collection, id) => {
  try {
    const organisationArray = await db.collection(collection).find({
      id,
    }).project({
      _id: 0,
    }).toArray();
    const [organisation] = organisationArray;
    if (organisation === undefined) {
      return null;
    }
    return createSuccessMessage('data', organisation);
  } catch (e) {
    return createErrorMessage('Error finding organisation');
  }
};

export const updateOrg = async (db, collection, id, dataToBeUpdated) => {
  const { name, description } = dataToBeUpdated;
  try {
    await db.collection(collection).update(
      { id },
      {
        $set: {
          name,
          description,
        },
      },
    );
    return createSuccessMessage();
  } catch (e) {
    return createErrorMessage('[Register]: Caught an error while updating organisation details.');
  }
};


// For setting up the organisation details
route.post(organisationRoutes.Setup, async (req, res) => {
  const { currentUser } = req;
  const db = await getDb();
  const userCollection = productionConstants.USERS_COLLECTION;
  const organisationCollection = productionConstants.ORGANISATIONS_COLLECTION;

  // Update user details
  const getUserIDResponse = await getUserID(db, userCollection, currentUser);
  if (getUserIDResponse.success !== true) {
    res.json(createErrorMessage('Could not fetch User ID'));
  } else {
    const response = await registerOrganisation(
      db,
      organisationCollection,
      {
        ...req.body,
        ownerID: getUserIDResponse.userID,
      },
    );
    res.json(response);
  }
});

// List all the organisations that pertain to an individual
route.get(organisationRoutes.List, async (req, res) => {
  const { currentUser } = req;
  const db = await getDb();
  const userCollection = productionConstants.USERS_COLLECTION;
  const organisationCollection = productionConstants.ORGANISATIONS_COLLECTION;

  const getUserIDResponse = await getUserID(db, userCollection, currentUser);
  if (getUserIDResponse.success !== true) {
    res.json(createErrorMessage('Could not fetch User ID'));
  } else {
    const {
      success,
      token,
      errors,
    } = await getWakaTimeTokenFromEmail(db, userCollection, currentUser);

    if (success === false) {
      res.json(errors);
    } else {
      const response = await listOrganisations(
        db,
        organisationCollection,
        getUserIDResponse.userID,
        token,
      );
      res.json(response);
    }
  }
});

route.get(organisationRoutes.Get, async (req, res) => {
  const db = await getDb();
  const collection = productionConstants.ORGANISATIONS_COLLECTION;
  const orgID = req.params.id;
  const organisation = await getOrg(db, collection, orgID);
  if (organisation === null) {
    res.json(createErrorMessage('This organisation does not exist'));
  } else {
    res.json(organisation);
  }
});

route.post(organisationRoutes.Update, async (req, res) => {
  const organisationID = req.params.id;
  const db = await getDb();
  const userCollection = productionConstants.USERS_COLLECTION;
  const orgCollection = productionConstants.ORGANISATIONS_COLLECTION;
  const actualOwner = await getOwnerID(db, orgCollection, organisationID);
  const { currentUser } = req;
  const getUserIDResponse = await getUserID(db, userCollection, currentUser);
  if (getUserIDResponse.userID !== actualOwner) {
    res.json(createErrorMessage('You are not the owner'));
  } else {
    const response = await updateOrg(db, orgCollection, organisationID, req.body);
    res.json(response);
  }
});

route.post(organisationRoutes.Invite, async (req, res) => {
  const { emails, manager, organisationID } = req.body;
  const emailsArray = JSON.parse(emails);

  const db = await getDb();
  const userCollection = productionConstants.USERS_COLLECTION;
  const orgCollection = productionConstants.ORGANISATIONS_COLLECTION;
  const actualOwner = await getOwnerID(db, orgCollection, organisationID);
  const { currentUser } = req;
  const getUserIDResponse = await getUserID(db, userCollection, currentUser);
  if (getUserIDResponse.userID !== actualOwner) {
    res.json(createErrorMessage('You are forbidden to invite other members'));
  } else {
    const organisation = await getOrg(db, orgCollection, organisationID);

    const { URLS: { FRONTEND_URL } } = productionConstants;

    // send email via invite
    emailsArray.forEach(async (email) => {
      const token = createInviteToken(email, manager, organisationID);

      const htmlData = getMailContentInHTML({
        email,
        organisation: organisation.data.name,
        manager,
        token,
        URL: FRONTEND_URL,
      });

      try {
        const message = {
          from: 'theremotants@gmail.com',
          to: email,
          subject: '[Invite] You are invited',
          html: htmlData,
        };
        await mailer(message);
      } catch (e) {
        res.json(createErrorMessage('Caught error while sending mail!'));
      }
    });
    res.json(createSuccessMessage());
  }
});

export default route;
