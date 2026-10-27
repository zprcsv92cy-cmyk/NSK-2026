-- Apply once before deploying the updated sharpening links API.
ALTER TABLE sharpening_links ADD COLUMN token_ciphertext TEXT;
