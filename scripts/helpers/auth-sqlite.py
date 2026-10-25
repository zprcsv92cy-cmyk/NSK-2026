import sqlite3,json,sys
conn=sqlite3.connect(sys.argv[1]);conn.row_factory=sqlite3.Row;conn.execute('PRAGMA foreign_keys=ON')
data=json.load(sys.stdin)
def execute(item):
 before=conn.total_changes
 cur=conn.execute(item['sql'],item.get('params',[]))
 rows=[dict(r) for r in cur.fetchall()] if cur.description else []
 return {'results':rows,'meta':{'changes':conn.total_changes-before},'success':True}
try:
 if 'script' in data:conn.executescript(data['script']);out={'success':True}
 elif 'batch' in data:
  conn.execute('BEGIN IMMEDIATE');out=[execute(item) for item in data['batch']];conn.commit()
 else:out=execute(data);conn.commit()
 print(json.dumps(out))
except Exception as e:
 conn.rollback();print(json.dumps({'error':str(e)}));sys.exit(1)
finally:conn.close()
