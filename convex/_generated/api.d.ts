/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as ai from "../ai.js";
import type * as comments from "../comments.js";
import type * as crons from "../crons.js";
import type * as emailActions from "../emailActions.js";
import type * as embeddings from "../embeddings.js";
import type * as http from "../http.js";
import type * as myFunctions from "../myFunctions.js";
import type * as notifications from "../notifications.js";
import type * as projects from "../projects.js";
import type * as push from "../push.js";
import type * as pushActions from "../pushActions.js";
import type * as sendWebPush from "../sendWebPush.js";
import type * as stats from "../stats.js";
import type * as storeSubscription from "../storeSubscription.js";
import type * as subscriptions from "../subscriptions.js";
import type * as teams from "../teams.js";
import type * as users from "../users.js";
import type * as webPush from "../webPush.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  ai: typeof ai;
  comments: typeof comments;
  crons: typeof crons;
  emailActions: typeof emailActions;
  embeddings: typeof embeddings;
  http: typeof http;
  myFunctions: typeof myFunctions;
  notifications: typeof notifications;
  projects: typeof projects;
  push: typeof push;
  pushActions: typeof pushActions;
  sendWebPush: typeof sendWebPush;
  stats: typeof stats;
  storeSubscription: typeof storeSubscription;
  subscriptions: typeof subscriptions;
  teams: typeof teams;
  users: typeof users;
  webPush: typeof webPush;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  pushNotifications: {
    public: {
      deleteNotificationsForUser: FunctionReference<
        "mutation",
        "internal",
        { logLevel: "DEBUG" | "INFO" | "WARN" | "ERROR"; userId: string },
        any
      >;
      getNotification: FunctionReference<
        "query",
        "internal",
        { id: string; logLevel: "DEBUG" | "INFO" | "WARN" | "ERROR" },
        null | {
          _contentAvailable?: boolean;
          _creationTime: number;
          badge?: number;
          body?: string;
          categoryId?: string;
          channelId?: string;
          data?: any;
          expiration?: number;
          interruptionLevel?:
            | "active"
            | "critical"
            | "passive"
            | "time-sensitive";
          mutableContent?: boolean;
          numPreviousFailures: number;
          priority?: "default" | "normal" | "high";
          sound?: string | null;
          state:
            | "awaiting_delivery"
            | "in_progress"
            | "delivered"
            | "needs_retry"
            | "failed"
            | "maybe_delivered"
            | "unable_to_deliver";
          subtitle?: string;
          title?: string;
          ttl?: number;
        }
      >;
      getNotificationsForUser: FunctionReference<
        "query",
        "internal",
        {
          limit?: number;
          logLevel: "DEBUG" | "INFO" | "WARN" | "ERROR";
          userId: string;
        },
        Array<{
          _contentAvailable?: boolean;
          _creationTime: number;
          badge?: number;
          body?: string;
          categoryId?: string;
          channelId?: string;
          data?: any;
          expiration?: number;
          id: string;
          interruptionLevel?:
            | "active"
            | "critical"
            | "passive"
            | "time-sensitive";
          mutableContent?: boolean;
          numPreviousFailures: number;
          priority?: "default" | "normal" | "high";
          sound?: string | null;
          state:
            | "awaiting_delivery"
            | "in_progress"
            | "delivered"
            | "needs_retry"
            | "failed"
            | "maybe_delivered"
            | "unable_to_deliver";
          subtitle?: string;
          title?: string;
          ttl?: number;
        }>
      >;
      getStatusForUser: FunctionReference<
        "query",
        "internal",
        { logLevel: "DEBUG" | "INFO" | "WARN" | "ERROR"; userId: string },
        { hasToken: boolean; paused: boolean }
      >;
      pauseNotificationsForUser: FunctionReference<
        "mutation",
        "internal",
        { logLevel: "DEBUG" | "INFO" | "WARN" | "ERROR"; userId: string },
        null
      >;
      recordPushNotificationToken: FunctionReference<
        "mutation",
        "internal",
        {
          logLevel: "DEBUG" | "INFO" | "WARN" | "ERROR";
          pushToken: string;
          userId: string;
        },
        null
      >;
      removePushNotificationToken: FunctionReference<
        "mutation",
        "internal",
        { logLevel: "DEBUG" | "INFO" | "WARN" | "ERROR"; userId: string },
        null
      >;
      restart: FunctionReference<
        "mutation",
        "internal",
        { logLevel: "DEBUG" | "INFO" | "WARN" | "ERROR" },
        boolean
      >;
      sendPushNotification: FunctionReference<
        "mutation",
        "internal",
        {
          allowUnregisteredTokens?: boolean;
          logLevel: "DEBUG" | "INFO" | "WARN" | "ERROR";
          notification: {
            _contentAvailable?: boolean;
            badge?: number;
            body?: string;
            categoryId?: string;
            channelId?: string;
            data?: any;
            expiration?: number;
            interruptionLevel?:
              | "active"
              | "critical"
              | "passive"
              | "time-sensitive";
            mutableContent?: boolean;
            priority?: "default" | "normal" | "high";
            sound?: string | null;
            subtitle?: string;
            title?: string;
            ttl?: number;
          };
          userId: string;
        },
        string | null
      >;
      shutdown: FunctionReference<
        "mutation",
        "internal",
        { logLevel: "DEBUG" | "INFO" | "WARN" | "ERROR" },
        { data?: any; message: string }
      >;
      unpauseNotificationsForUser: FunctionReference<
        "mutation",
        "internal",
        { logLevel: "DEBUG" | "INFO" | "WARN" | "ERROR"; userId: string },
        null
      >;
    };
  };
};
