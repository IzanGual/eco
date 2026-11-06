import {
  ShoppingCart, Restaurant, Cafe, Delivery, Home, Building, Idea, Humidity, Wifi, Car, GasStation, Train, Taxi, Tools,
  Plane, Events, Video, GameConsole, Music, Book, Education, ShoppingBag, Mobile, Laptop, Gift, Medication, Stethoscope,
  Running, Repeat, Screen, Application, Cut, DogWalker, Portfolio, Star, Money, Currency, Wallet, Finance, Purchase,
  PiggyBank, ChartLine, Undo, Favorite, Receipt, Soccer, Sprout, Package, Tag, Bicycle, Bus, Hotel, Bar, Drink_01,
  HealthCross, Ticket, Theater, Camera, Plug, Basketball, Sun, Umbrella, Construction, Apple, Fish, Strawberry,
  Swim, Trophy, Tree, UserMultiple, Phone, Calendar, Headphones, Scooter, Clean, Lightning, Globe, Bullhorn,
  Tennis, ChargingStation, Collaborate, Hospital, Locked
} from '@carbon/icons-react';
import type { ComponentType } from 'react';

type CarbonIcon = ComponentType<{ size?: number | string; className?: string }>;

/** Catálogo de iconos para categorías y carteras (nombre guardado en la base de datos → componente). */
export const ICONS: Record<string, CarbonIcon> = {
  // comida
  cart: ShoppingCart, restaurant: Restaurant, cafe: Cafe, delivery: Delivery, bar: Bar, drink: Drink_01, apple: Apple,
  fish: Fish, strawberry: Strawberry,
  // casa
  home: Home, building: Building, idea: Idea, water: Humidity, wifi: Wifi, lightning: Lightning, key: Locked, clean: Clean,
  construction: Construction, plug: Plug,
  // transporte
  car: Car, gas: GasStation, train: Train, taxi: Taxi, bus: Bus, bicycle: Bicycle, scooter: Scooter, plane: Plane,
  charging: ChargingStation, tools: Tools,
  // ocio
  events: Events, video: Video, game: GameConsole, music: Music, headphones: Headphones, ticket: Ticket, theater: Theater,
  camera: Camera, hotel: Hotel, globe: Globe, sun: Sun, umbrella: Umbrella, soccer: Soccer, basketball: Basketball,
  tennis: Tennis, swim: Swim, running: Running, trophy: Trophy, tree: Tree,
  // compras
  bag: ShoppingBag, mobile: Mobile, laptop: Laptop, gift: Gift, package: Package, tag: Tag,
  // salud y personal
  medication: Medication, stethoscope: Stethoscope, health: HealthCross, hospital: Hospital, cut: Cut, pet: DogWalker,
  heart: Favorite, people: UserMultiple, collaborate: Collaborate, phone: Phone,
  // suscripciones y estudios
  repeat: Repeat, screen: Screen, app: Application, book: Book, education: Education, calendar: Calendar, bullhorn: Bullhorn,
  // dinero
  briefcase: Portfolio, star: Star, money: Money, currency: Currency, wallet: Wallet, bank: Finance, card: Purchase,
  piggy: PiggyBank, chart: ChartLine, undo: Undo, receipt: Receipt, sprout: Sprout
};

export const ICON_NAMES = Object.keys(ICONS);

export function CatIcon({ name, size = 20, className }: { name: string; size?: number; className?: string }) {
  const C = ICONS[name] ?? Tag;
  return <C size={size} className={className} />;
}

/** Paleta terrosa para categorías: se lee bien sobre papel y sobre tinta. */
export const PALETTE = [
  '#C4572E', // terracota
  '#C99A2E', // ocre
  '#7C8B3A', // oliva
  '#5E8C6A', // salvia
  '#2F7A78', // petróleo
  '#4F6D8F', // pizarra
  '#5A5A9E', // índigo
  '#8A4F7D', // ciruela
  '#C0627A', // rosa viejo
  '#A86F4C', // arcilla
  '#B39566', // arena
  '#6B6760' // grafito
];

/** Emojis de la v0.1 → iconos nuevos (migración). */
export const EMOJI_TO_ICON: Record<string, string> = {
  '🛒': 'cart', '🍽️': 'restaurant', '☕': 'cafe', '🛵': 'delivery', '🏠': 'home', '🔑': 'key', '💡': 'idea', '🚿': 'water',
  '📶': 'wifi', '🛋️': 'home', '🚗': 'car', '⛽': 'gas', '🚇': 'train', '🚕': 'taxi', '🅿️': 'car', '🔧': 'tools',
  '🎉': 'events', '🍻': 'bar', '🎬': 'video', '✈️': 'plane', '🎮': 'game', '🛍️': 'bag', '👕': 'bag', '📱': 'mobile',
  '🎁': 'gift', '💊': 'medication', '🩺': 'stethoscope', '🏋️': 'running', '🔁': 'repeat', '📺': 'screen', '📲': 'app',
  '💇': 'cut', '🐾': 'pet', '📚': 'book', '📦': 'package', '💼': 'briefcase', '✨': 'star', '↩️': 'undo', '💰': 'money',
  '🏦': 'bank', '💶': 'money', '💳': 'card', '🐷': 'piggy'
};

/** Colores de la v0.1 → paleta terrosa. */
export const OLD_COLOR_TO_NEW: Record<string, string> = {
  '#f59e0b': '#C99A2E', '#6366f1': '#5A5A9E', '#0ea5e9': '#4F6D8F', '#ec4899': '#C0627A', '#a855f7': '#8A4F7D',
  '#ef4444': '#C4572E', '#14b8a6': '#2F7A78', '#f472b6': '#C0627A', '#84cc16': '#7C8B3A', '#3b82f6': '#4F6D8F',
  '#64748b': '#6B6760', '#10b981': '#5E8C6A', '#22c55e': '#7C8B3A', '#06b6d4': '#2F7A78', '#8b5cf6': '#5A5A9E',
  '#059669': '#5E8C6A'
};
