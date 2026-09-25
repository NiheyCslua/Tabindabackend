-- Make email, password and role optional so that employees with "No App
-- Access" can be stored without application login credentials.
ALTER TABLE "User" ALTER COLUMN "email" DROP NOT NULL;
ALTER TABLE "User" ALTER COLUMN "password" DROP NOT NULL;
ALTER TABLE "User" ALTER COLUMN "role" DROP NOT NULL;

-- Remove the Department field (superseded by the free-text Role/Designation
-- field, "position").
ALTER TABLE "User" DROP COLUMN IF EXISTS "department";

-- Add an optional, unique CNIC Number field. No formatting is enforced so
-- both "3520212345671" and "35202-1234567-1" are accepted as-is.
ALTER TABLE "User" ADD COLUMN "cnic" TEXT;
CREATE UNIQUE INDEX "User_cnic_key" ON "User"("cnic");
