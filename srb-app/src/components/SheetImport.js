import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabaseClient'
const TRACKS = ['Babes Who Fight Bears', 'Strong & Savage', 'Olympic Weightlifting', 'Private']
const STYPES = ['Warm-Up', 'Strength', 'Accessory', 'Conditioning', 'Core', 'Cooldown', 'Skills', 'Custom']
const SCORE_TYPES = ['No Score', 'Heaviest Set', 'For Time', 'AMRAP', 'Max Reps / Calories', 'Max Distance']
const DAY_OFFSETS = { '1': 0, '2': 2, '3': 4 }
const TEMPLATE = `date,track,title,workout_notes,section_type,score_type,section_notes,movement,movement_notes,set_count,reps,load,rpe,demo_url
2026-07-06,Strong & Savage,Back Squat Day,,Strength,Heaviest Set,,Back Squat,,4,3,80%,8,
2026-07-06,Strong & Savage,Back Squat Day,,Accessory,No Score,3 Rounds,Split Squat,,3,10/side,,,
2026-07-08,Strong & Savage,Conditioning,,Conditioning,For Time,,Bike Calories,,1,50,,,`
function clean(value) {
  return String(value || '').trim()
}
function normalize(value) {
  return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
}
function pick(row, names) {
  for (const name of names) {
    const value = row[normalize(name)]
    if (value != null && clean(value) !== '') return clean(value)
  }
  return ''
}
function toISODate(date) {
  if (!date || Number.isNaN(date.getTime())) return ''
  return date.toISOString().split('T')[0]
}
function addDays(date, days) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}
function firstMondayOfMonth(year, monthIndex) {
  const date = new Date(year, monthIndex, 1, 12, 0, 0)
  const offset = (8 - date.getDay()) % 7
  return addDays(date, offset)
}
function inferStartDateFromName(fileName) {
  const months = {
    january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
    july: 6, august: 7, september: 8, october: 9, november: 10, december: 11
  }
  const match = clean(fileName).toLowerCase().match(/(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{4})/)
  if (!match) return ''
  return toISODate(firstMondayOfMonth(parseInt(match[2], 10), months[match[1]]))
}
function parseDelimited(text) {
  const delimiter = text.includes('\t') ? '\t' : ','
  const rows = []
  let row = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    const next = text[i + 1]
    if (char === '"' && quoted && next === '"') {
      cell += '"'
      i += 1
    } else if (char === '"') {
      quoted = !quoted
    } else if (char === delimiter && !quoted) {
      row.push(cell)
      cell = ''
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') i += 1
      row.push(cell)
      if (row.some(v => clean(v))) rows.push(row)
      row = []
      cell = ''
    } else {
      cell += char
    }
  }
  row.push(cell)
  if (row.some(v => clean(v))) rows.push(row)
  return rows
}
function parseRows(text) {
  const table = parseDelimited(text)
  if (table.length < 2) return []
  const headers = table[0].map(normalize)
  return table.slice(1).map(values => {
    const row = {}
    headers.forEach((header, index) => { row[header] = clean(values[index]) })
    return row
