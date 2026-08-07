/**
 * File domain events (Main → Renderer) for ManagedFile / association changes.
 * Do not import Electron or Node APIs from this module.
 */

import type { FileAssociationRole } from "./file-association";

export type FileDomainEvent =
  | {
      type: "file:created";
      fileId: string;
      sessionId?: string;
      role?: FileAssociationRole;
    }
  | {
      type: "file:updated";
      fileId: string;
    }
  | {
      type: "file:association-created";
      fileId: string;
      sessionId: string;
      role: FileAssociationRole;
    };

export type FileDomainEventListener = (event: FileDomainEvent) => void;

/** Push channel from Main to Renderer (not an invoke handler). */
export const FILE_DOMAIN_EVENT_CHANNEL = "files:event" as const;
