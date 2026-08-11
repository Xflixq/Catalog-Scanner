// Local entry so Metro never has to resolve ./node_modules/expo-router/entry
// from a monorepo package path (that breaks under pnpm + Windows + web).
import 'expo-router/entry';
