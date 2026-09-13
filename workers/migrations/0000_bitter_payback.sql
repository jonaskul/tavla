CREATE TABLE `app_user` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`external_auth_id` text,
	`email` text NOT NULL,
	`name` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ix_app_user_external_auth_id` ON `app_user` (`external_auth_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `ix_app_user_email` ON `app_user` (`email`);--> statement-breakpoint
CREATE TABLE `changelog` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`organization_id` integer NOT NULL,
	`circuit_id` integer,
	`connection_point_id` integer,
	`equipment_id` integer,
	`changed_by` text DEFAULT 'system' NOT NULL,
	`description` text NOT NULL,
	`changed_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`circuit_id`) REFERENCES `circuit`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`connection_point_id`) REFERENCES `connectionpoint`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`equipment_id`) REFERENCES `equipment`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `ix_changelog_organization_id` ON `changelog` (`organization_id`);--> statement-breakpoint
CREATE TABLE `channel` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`organization_id` integer NOT NULL,
	`equipment_id` integer NOT NULL,
	`number` integer NOT NULL,
	`label` text,
	`load` text,
	`circuit_id` integer,
	`notes` text,
	`channel_type` text DEFAULT 'relay' NOT NULL,
	`watt` integer,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`equipment_id`) REFERENCES `equipment`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`circuit_id`) REFERENCES `circuit`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `ix_channel_organization_id` ON `channel` (`organization_id`);--> statement-breakpoint
CREATE TABLE `circuit` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`organization_id` integer NOT NULL,
	`panel_id` integer NOT NULL,
	`designation` text NOT NULL,
	`name` text NOT NULL,
	`room` text,
	`cable_type` text,
	`cross_section` real,
	`conductor_count` integer,
	`length_m` real,
	`notes` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`panel_id`) REFERENCES `panel`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `ix_circuit_organization_id` ON `circuit` (`organization_id`);--> statement-breakpoint
CREATE TABLE `connectionpoint` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`organization_id` integer NOT NULL,
	`circuit_id` integer NOT NULL,
	`type` text NOT NULL,
	`location` text NOT NULL,
	`notes` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`circuit_id`) REFERENCES `circuit`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `ix_connectionpoint_organization_id` ON `connectionpoint` (`organization_id`);--> statement-breakpoint
CREATE TABLE `equipment` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`organization_id` integer NOT NULL,
	`circuit_id` integer NOT NULL,
	`type` text NOT NULL,
	`brand` text,
	`model` text,
	`watt` integer,
	`notes` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`circuit_id`) REFERENCES `circuit`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `ix_equipment_organization_id` ON `equipment` (`organization_id`);--> statement-breakpoint
CREATE TABLE `file` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`organization_id` integer NOT NULL,
	`connection_point_id` integer,
	`equipment_id` integer,
	`filename` text NOT NULL,
	`mimetype` text NOT NULL,
	`storage_key` text NOT NULL,
	`uploaded_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`connection_point_id`) REFERENCES `connectionpoint`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`equipment_id`) REFERENCES `equipment`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `ix_file_organization_id` ON `file` (`organization_id`);--> statement-breakpoint
CREATE TABLE `logincode` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`email` text NOT NULL,
	`code_hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	`used_at` integer,
	`attempts` integer DEFAULT 0 NOT NULL,
	`requested_ip` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `ix_logincode_email` ON `logincode` (`email`);--> statement-breakpoint
CREATE INDEX `ix_logincode_created_at` ON `logincode` (`created_at`);--> statement-breakpoint
CREATE TABLE `membership` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`organization_id` integer NOT NULL,
	`role` text DEFAULT 'member' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `app_user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ux_membership_user_org` ON `membership` (`user_id`,`organization_id`);--> statement-breakpoint
CREATE INDEX `ix_membership_user_id` ON `membership` (`user_id`);--> statement-breakpoint
CREATE INDEX `ix_membership_organization_id` ON `membership` (`organization_id`);--> statement-breakpoint
CREATE TABLE `module` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`organization_id` integer NOT NULL,
	`panel_id` integer NOT NULL,
	`row` integer NOT NULL,
	`position` integer NOT NULL,
	`width` integer DEFAULT 1 NOT NULL,
	`type` text NOT NULL,
	`label` text,
	`ampere` integer,
	`has_rcd` integer DEFAULT false NOT NULL,
	`circuit_id` integer,
	`is_vacant` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`panel_id`) REFERENCES `panel`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`circuit_id`) REFERENCES `circuit`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `ix_module_organization_id` ON `module` (`organization_id`);--> statement-breakpoint
CREATE TABLE `moduletypedefinition` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`organization_id` integer,
	`key` text NOT NULL,
	`name_no` text NOT NULL,
	`color` text NOT NULL,
	`abbreviation` text NOT NULL,
	`can_have_circuit` integer DEFAULT false NOT NULL,
	`can_have_ampere` integer DEFAULT false NOT NULL,
	`is_builtin` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ux_moduletype_org_key` ON `moduletypedefinition` (`organization_id`,`key`);--> statement-breakpoint
CREATE INDEX `ix_moduletypedefinition_key` ON `moduletypedefinition` (`key`);--> statement-breakpoint
CREATE INDEX `ix_moduletypedefinition_organization_id` ON `moduletypedefinition` (`organization_id`);--> statement-breakpoint
CREATE TABLE `organization` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `panel` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`organization_id` integer NOT NULL,
	`property_id` integer NOT NULL,
	`name` text NOT NULL,
	`location` text NOT NULL,
	`rows` integer DEFAULT 1 NOT NULL,
	`modules_per_row` integer DEFAULT 12 NOT NULL,
	`notes` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`property_id`) REFERENCES `property`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `ix_panel_organization_id` ON `panel` (`organization_id`);--> statement-breakpoint
CREATE TABLE `property` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`organization_id` integer NOT NULL,
	`name` text NOT NULL,
	`address` text NOT NULL,
	`owner_name` text,
	`owner_email` text,
	`owner_phone` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `ix_property_organization_id` ON `property` (`organization_id`);--> statement-breakpoint
CREATE TABLE `usersession` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	`revoked_at` integer,
	`last_seen_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`user_agent` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `app_user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ix_usersession_token_hash` ON `usersession` (`token_hash`);--> statement-breakpoint
CREATE INDEX `ix_usersession_user_id` ON `usersession` (`user_id`);