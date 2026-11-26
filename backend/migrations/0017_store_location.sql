ALTER TABLE stores
    ADD COLUMN lat double precision,
    ADD COLUMN lng double precision,
    ADD COLUMN location_verified boolean NOT NULL DEFAULT false,
    ADD COLUMN payments text[] NOT NULL DEFAULT '{}' CHECK (payments <@ ARRAY['card','cash','transfer','onnuri']::text[]),
    ADD COLUMN intro text CHECK (char_length(intro) <= 80);
ALTER TABLE markets ADD COLUMN amenities jsonb;
