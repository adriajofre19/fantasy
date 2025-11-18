# Fantasy NBA - Sistema de Gestión de Equipos

## 📋 Descripción

Sistema completo de Fantasy NBA donde los usuarios pueden:
- Crear y gestionar su equipo con hasta 9 jugadores (5 titulares + 4 suplentes)
- Comprar y vender jugadores entre usuarios
- Establecer cláusulas de rescisión para sus jugadores
- Sistema de cooldown de 7 días después de comprar un jugador

## 🗄️ Base de Datos

### Migración de Supabase

Para configurar la base de datos, ejecuta la migración SQL en tu proyecto de Supabase:

1. Ve a tu proyecto en [Supabase Dashboard](https://app.supabase.com)
2. Navega a **SQL Editor**
3. Copia y ejecuta el contenido de `supabase/migrations/001_fantasy_schema.sql`

### Estructura de Tablas

- **user_teams**: Equipos de usuarios con presupuesto
- **players_on_team**: Jugadores en equipos (con cláusulas y cooldown)
- **transactions**: Historial de compras/ventas

## 🚀 Funcionalidades

### 1. Mi Equipo (`/my-team`)
- Ver jugadores titulares y suplentes
- Mover jugadores entre titular y banquillo
- Establecer/editar cláusulas de rescisión
- Ver presupuesto disponible

### 2. Mercado (`/market`)
- Ver jugadores disponibles para comprar
- Comprar jugadores de otros usuarios
- Ver cláusulas de rescisión
- Verificar presupuesto antes de comprar

### 3. Reglas del Sistema

#### Límites de Jugadores
- **Máximo 5 titulares**
- **Máximo 4 suplentes**
- **Total máximo: 9 jugadores**

#### Presupuesto
- Presupuesto inicial: **$1,000,000**
- Se actualiza automáticamente al comprar/vender

#### Cláusulas de Rescisión
- Los usuarios pueden establecer cláusulas para sus jugadores
- Si otro usuario quiere comprar, debe pagar la cláusula
- Si no hay cláusula, se usa el precio de compra original

#### Cooldown de 7 Días
- Después de comprar un jugador, no puede ser vendido por 7 días
- El sistema verifica automáticamente si pasaron los 7 días
- Los jugadores iniciales no tienen cooldown

## 📁 Estructura de Archivos

```
src/
├── lib/
│   ├── fantasy.ts          # Funciones de utilidad para Fantasy
│   └── supabase.ts         # Cliente de Supabase
├── pages/
│   ├── my-team.astro       # Página de mi equipo
│   ├── market.astro        # Página de mercado
│   ├── dashboard.astro     # Dashboard principal
│   └── api/
│       └── fantasy/
│           ├── buy-player.ts    # Endpoint para comprar jugador
│           ├── move-player.ts   # Endpoint para mover jugador
│           └── set-clause.ts    # Endpoint para establecer cláusula
└── supabase/
    └── migrations/
        └── 001_fantasy_schema.sql  # Esquema de base de datos
```

## 🔐 Autenticación

El sistema usa autenticación con Google (ya implementada) mediante Supabase. Los usuarios deben estar autenticados para:
- Ver su equipo
- Acceder al mercado
- Comprar/vender jugadores
- Gestionar cláusulas

## 🎮 Flujo de Uso

1. **Iniciar sesión** con Google
2. **Ir a "Mi Equipo"** para ver tu equipo actual
3. **Agregar jugadores iniciales** (si no tienes ninguno)
4. **Ir al "Mercado"** para comprar jugadores de otros usuarios
5. **Establecer cláusulas** en tus jugadores para protegerlos
6. **Gestionar titulares/suplentes** según tus necesidades

## 🔄 Próximos Pasos

Para agregar jugadores iniciales a tu equipo, puedes:
1. Crear un endpoint `/api/fantasy/add-initial-player` que permita agregar jugadores desde la lista de NBA
2. O crear una página de selección inicial donde los usuarios elijan sus primeros jugadores

## ⚠️ Notas Importantes

- Las transacciones se realizan automáticamente y actualizan los presupuestos
- El sistema verifica automáticamente los límites antes de cada operación
- El cooldown de 7 días se verifica automáticamente en cada actualización
- Las cláusulas se resetean cuando un jugador es comprado

