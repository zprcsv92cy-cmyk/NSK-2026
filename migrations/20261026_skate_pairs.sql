ALTER TABLE sharpening_history ADD COLUMN pair TEXT NOT NULL DEFAULT 'regular' CHECK(pair IN ('regular','goalie'));
CREATE INDEX IF NOT EXISTS sharpening_history_pair ON sharpening_history(team_id,person_id,pair,completed_at DESC,id DESC);
DROP TRIGGER IF EXISTS sharpening_completed_insert;
DROP TRIGGER IF EXISTS sharpening_completed_update;
CREATE TRIGGER IF NOT EXISTS sharpening_completed_insert AFTER INSERT ON equipment_boards BEGIN
 INSERT INTO sharpening_history(team_id,request_id,person_id,pair,completion_revision,completed_at,hollow,profile)
 SELECT NEW.team_id,json_extract(r.value,'$.id'),json_extract(r.value,'$.personId'),COALESCE(json_extract(r.value,'$.pair'),'regular'),NEW.revision,strftime('%Y-%m-%dT%H:%M:%fZ','now'),COALESCE(json_extract(r.value,'$.skates.hollow'),''),COALESCE(json_extract(r.value,'$.skates.profile'),'') FROM json_each(NEW.board_json,'$.requests') r
 WHERE json_extract(r.value,'$.kind')='player' AND json_extract(r.value,'$.done')=1
 ON CONFLICT(team_id,request_id,completion_revision) DO NOTHING;
END;
CREATE TRIGGER IF NOT EXISTS sharpening_completed_update AFTER UPDATE OF board_json ON equipment_boards BEGIN
 INSERT INTO sharpening_history(team_id,request_id,person_id,pair,completion_revision,completed_at,hollow,profile)
 SELECT NEW.team_id,json_extract(r.value,'$.id'),json_extract(r.value,'$.personId'),COALESCE(json_extract(r.value,'$.pair'),'regular'),NEW.revision,strftime('%Y-%m-%dT%H:%M:%fZ','now'),COALESCE(json_extract(r.value,'$.skates.hollow'),''),COALESCE(json_extract(r.value,'$.skates.profile'),'') FROM json_each(NEW.board_json,'$.requests') r
 WHERE json_extract(r.value,'$.kind')='player' AND json_extract(r.value,'$.done')=1 AND NOT EXISTS (SELECT 1 FROM json_each(OLD.board_json,'$.requests') old WHERE json_extract(old.value,'$.id')=json_extract(r.value,'$.id') AND json_extract(old.value,'$.personId')=json_extract(r.value,'$.personId') AND json_extract(old.value,'$.kind')='player' AND json_extract(old.value,'$.done')=1)
 ON CONFLICT(team_id,request_id,completion_revision) DO NOTHING;
END;
