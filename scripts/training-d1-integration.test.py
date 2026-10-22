import sqlite3
import pathlib
import unittest

SQL = pathlib.Path(__file__).resolve().parents[1].joinpath("migrations/20261022_training_sessions.sql").read_text()

class TrainingStorageTests(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(":memory:")
        self.db.executescript(SQL)

    def save(self, team, date, revision, players):
        if revision == 0:
            cur = self.db.execute(
                """INSERT INTO training_sessions
                (team_id,training_date,selected_players_json,selected_coaches_json,goalies_json,goalie_count,allocation_json,revision,updated_by)
                VALUES (?,?,?,'[]','[]',0,'[]',1,'leader-a')
                ON CONFLICT(team_id,training_date) DO NOTHING""",
                (team,date,players))
        else:
            cur = self.db.execute(
                """UPDATE training_sessions SET selected_players_json=?,revision=revision+1,
                updated_at=CURRENT_TIMESTAMP,updated_by='leader-b'
                WHERE team_id=? AND training_date=? AND revision=?""",
                (players,team,date,revision))
        return cur.rowcount

    def test_two_leaders_and_conflict(self):
        self.assertEqual(self.save('18','2026-10-22',0,'["1"]'),1)
        self.assertEqual(self.save('18','2026-10-22',0,'["2"]'),0)
        self.assertEqual(self.save('18','2026-10-22',1,'["2"]'),1)
        self.assertEqual(self.save('18','2026-10-22',1,'["3"]'),0)
        row=self.db.execute("SELECT selected_players_json,revision FROM training_sessions WHERE team_id='18'").fetchone()
        self.assertEqual(row,('["2"]',2))

    def test_team_isolation(self):
        self.assertEqual(self.save('18','2026-10-22',0,'["1"]'),1)
        self.assertEqual(self.save('19','2026-10-22',0,'["2"]'),1)
        self.assertEqual(self.save('19','2026-10-22',1,'["3"]'),1)
        self.assertEqual(self.db.execute("SELECT selected_players_json FROM training_sessions WHERE team_id='18'").fetchone()[0],'["1"]')

if __name__ == '__main__':
    unittest.main()
