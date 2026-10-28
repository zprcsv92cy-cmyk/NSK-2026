-- Coach IDs are namespaced; existing player tokens and history remain untouched.
INSERT OR IGNORE INTO sharpening_history(team_id,request_id,person_id,pair,completion_revision,completed_at,hollow,profile)
 SELECT b.team_id,json_extract(r.value,'$.id'),'coach:'||json_extract(r.value,'$.personId'),COALESCE(json_extract(r.value,'$.pair'),'regular'),0,NULL,COALESCE(json_extract(r.value,'$.skates.hollow'),''),COALESCE(json_extract(r.value,'$.skates.profile'),'')
 FROM equipment_boards b,json_each(b.board_json,'$.requests') r WHERE json_extract(r.value,'$.kind')='coach' AND json_extract(r.value,'$.done')=1 AND NOT EXISTS (SELECT 1 FROM sharpening_history h WHERE h.team_id=b.team_id AND h.request_id=json_extract(r.value,'$.id'));
CREATE TRIGGER IF NOT EXISTS sharpening_coach_completed_insert AFTER INSERT ON equipment_boards BEGIN
 INSERT INTO sharpening_history(team_id,request_id,person_id,pair,completion_revision,completed_at,hollow,profile)
 SELECT NEW.team_id,json_extract(r.value,'$.id'),'coach:'||json_extract(r.value,'$.personId'),COALESCE(json_extract(r.value,'$.pair'),'regular'),NEW.revision,strftime('%Y-%m-%dT%H:%M:%fZ','now'),COALESCE(json_extract(r.value,'$.skates.hollow'),''),COALESCE(json_extract(r.value,'$.skates.profile'),'') FROM json_each(NEW.board_json,'$.requests') r
 WHERE json_extract(r.value,'$.kind')='coach' AND json_extract(r.value,'$.done')=1
 ON CONFLICT(team_id,request_id,completion_revision) DO NOTHING;
END;
CREATE TRIGGER IF NOT EXISTS sharpening_coach_completed_update AFTER UPDATE OF board_json ON equipment_boards BEGIN
 INSERT INTO sharpening_history(team_id,request_id,person_id,pair,completion_revision,completed_at,hollow,profile)
 SELECT NEW.team_id,json_extract(r.value,'$.id'),'coach:'||json_extract(r.value,'$.personId'),COALESCE(json_extract(r.value,'$.pair'),'regular'),NEW.revision,strftime('%Y-%m-%dT%H:%M:%fZ','now'),COALESCE(json_extract(r.value,'$.skates.hollow'),''),COALESCE(json_extract(r.value,'$.skates.profile'),'') FROM json_each(NEW.board_json,'$.requests') r
 WHERE json_extract(r.value,'$.kind')='coach' AND json_extract(r.value,'$.done')=1 AND NOT EXISTS (SELECT 1 FROM json_each(OLD.board_json,'$.requests') old WHERE json_extract(old.value,'$.id')=json_extract(r.value,'$.id') AND json_extract(old.value,'$.personId')=json_extract(r.value,'$.personId') AND json_extract(old.value,'$.kind')='coach' AND json_extract(old.value,'$.done')=1)
 ON CONFLICT(team_id,request_id,completion_revision) DO NOTHING;
END;
