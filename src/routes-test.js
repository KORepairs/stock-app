// src/routes-test.js
import express from 'express';

const app = express();

app.get('/hello', (req, res) => res.type('text').send('hi'));

const PORT = 4000;
app.listen(PORT, () => {
  console.log('TEST server running on http://localhost:' + PORT);
});
