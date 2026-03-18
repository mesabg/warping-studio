# Guia de Presentacion: Warping Studio

## 1. Idea general

Esta demo muestra dos familias de problemas de transformacion visual:

- `Morphing 2D` entre dos imagenes, usando correspondencias semanticas.
- `Morphing 3D` entre dos archivos `OBJ`, cuando la topologia coincide o cuando no coincide.

La idea principal para presentar el sistema es esta:

1. Definimos correspondencias entre estructuras equivalentes.
2. Calculamos una geometria intermedia para un tiempo `t`.
3. Re-muestreamos la imagen o la malla segun esa geometria.
4. Mezclamos visualmente el resultado.

Una frase simple para abrir la presentacion:

> Esta demo enseña como pasar de una fuente a un destino de forma controlada, no solo mezclando colores, sino deformando la geometria de manera coherente.

---

## 2. Que ve el usuario en la interfaz

La interfaz tiene tres zonas principales:

- `Source`: la entrada A.
- `Destination`: la entrada B.
- `Result`: el resultado interpolado.

En la columna izquierda estan los controles:

- `Time Parameter`: controla el tiempo `t`, entre 0 y 1.
- `Warping Algorithm`: selecciona el algoritmo geometrico.
- `Interpolation`: controla como se re-muestrean pixeles en coordenadas fraccionarias.
- `Annotation Mode`: define si trabajamos con puntos o con lineas dirigidas.
- `Voxel Resolution`: solo afecta el modo `OBJ` cuando la demo entra en voxel fallback.

En el panel `Runtime` se reporta:

- el render activo: `WebGPU`, `WebGL2` o `CPU`
- el proceso activo
- el backend matematico o de composicion
- el estado de las anotaciones
- el modo actual

---

## 3. Guion corto para explicar el flujo completo

Una forma clara de contarlo es:

1. Cargo dos imagenes o dos mallas.
2. Marco que partes de A corresponden a que partes de B.
3. El sistema calcula una forma intermedia para un valor `t`.
4. Luego reconstruye la apariencia del resultado a partir de ambas entradas.
5. Finalmente compone el frame con el backend grafico disponible.

Mensaje importante:

> El morph no es solo un cross-dissolve. Primero deformamos la geometria y despues mezclamos apariencia.

---

## 4. Modo Imagen 2D

### 4.1 Corresponding Points

Este modo sirve para landmarks discretos:

- ojos
- punta de nariz
- comisuras de labios
- borde del menton

Como explicarlo:

> Cada par de puntos dice: esta estructura en la imagen A corresponde a esta estructura en la imagen B.

En la demo:

- se hace click en `Source`
- luego en `Destination`
- y se repite para cada par

Con suficientes puntos, el sistema ya puede deformar la imagen de forma estable.

### 4.2 Directed Feature Lines

Este modo se usa para estructuras alargadas o contornos:

- linea de la boca
- puente de la nariz
- cejas
- mandibula
- silueta del rostro

Aqui la direccion importa.

No es una linea cualquiera: es una linea `inicio -> fin`.
Por eso, en ambas imagenes hay que dibujar la linea con el mismo significado geometrico.

Ejemplos correctos:

- de la comisura izquierda a la derecha, en ambas imagenes
- de arriba hacia abajo en el puente nasal, en ambas imagenes

Como decirlo en la presentacion:

> Las lineas dirigidas definen no solo posicion, sino orientacion local. Eso permite controlar mucho mejor bordes y contornos que con puntos aislados.

---

## 5. Algoritmos de warping 2D

## 5.1 Mesh Warping (Delaunay)

Este es el warping por malla.

Idea:

- los puntos de control generan una triangulacion
- el sistema interpola una malla intermedia
- cada triangulo se deforma de forma afin

Como contarlo:

> Dividimos la imagen en pequeños triangulos. Cada triangulo se mueve de forma controlada hacia su posicion intermedia. Eso da un warp estable y rapido.

Ventajas:

- intuitivo
- robusto
- eficiente
- bueno para demostracion en vivo

Limitacion:

- pueden notarse transiciones por triangulos si las correspondencias son pocas o mal distribuidas

## 5.2 Thin-Plate Splines

Este algoritmo modela la deformacion como una superficie suave que pasa por los puntos de control.

Como contarlo:

> En lugar de deformar triangulo por triangulo, TPS construye una deformacion global y suave que minimiza la curvatura.

Ventajas:

- deformaciones organicas
- transiciones suaves
- muy util para rostros

Limitacion:

- es mas costoso que la malla
- si los puntos estan mal puestos, la deformacion global puede propagarse demasiado

## 5.3 Field Morphing (Beier-Neely)

Este algoritmo usa lineas dirigidas en lugar de puntos.

Idea:

- cada linea define un sistema de referencia local
- cada pixel se desplaza con una combinacion ponderada de todas las lineas
- las lineas mas cercanas tienen mas influencia

Como decirlo:

> Aqui no digo solo donde esta un punto, sino como se orienta una estructura completa. Eso permite deformar mejor labios, cejas, nariz o contornos.

Ventajas:

- excelente para bordes y formas alargadas
- mas semantico que un conjunto pequeño de puntos

Limitacion:

- la direccion de la linea importa
- si la orientacion no coincide entre A y B, el warp puede torcerse

---

## 6. Interpolacion de pixeles

Despues de deformar la geometria, el sistema debe decidir como reconstruir el color cuando la coordenada cae entre pixeles.

La demo ofrece:

- `Nearest`
- `Bilinear`
- `Bicubic`

Como presentarlo:

- `Nearest`: mas rapido, pero mas tosco
- `Bilinear`: compromiso razonable, buen default
- `Bicubic`: mejor calidad visual, especialmente en detalles finos

Frase util:

> El warp define donde muestrear; la interpolacion define como reconstruir la intensidad cuando la muestra no cae exactamente en un pixel entero.

---

## 7. El parametro de tiempo `t`

`t = 0` significa:

- geometria y apariencia cercanas a `Source`

`t = 1` significa:

- geometria y apariencia cercanas a `Destination`

Para valores intermedios:

- la forma y la textura evolucionan de manera gradual

Como explicarlo:

> `t` no solo mezcla colores. Tambien mueve la geometria hacia una configuracion intermedia.

---

## 8. Modo OBJ 3D

La demo tambien tiene un modo para `OBJ`.

Hay dos escenarios.

### 8.1 Compatible Mesh Interpolation

Si ambos modelos tienen topologia compatible:

- mismo numero de vertices
- misma conectividad

entonces se puede hacer interpolacion directa de vertices.

Como decirlo:

> Si existe correspondencia uno a uno entre vertices, el morph 3D es directo: cada vertice se mueve hacia su contraparte.

Ventaja:

- se ve como una verdadera superficie en transformacion

### 8.2 Voxel Fallback

Si la topologia no coincide, la demo no fuerza una correspondencia falsa.
En ese caso entra en `voxel fallback`.

Como explicarlo:

> Cuando las mallas no son compatibles, la demo cambia de estrategia. En lugar de inventar una correspondencia invalida entre vertices, genera una representacion volumetrica aproximada y mezcla esa ocupacion espacial.

Esto es importante porque evita vender un morph 3D incorrecto como si fuera valido.

---

## 9. Que hace Voxel Resolution

`Voxel Resolution` solo afecta el modo `OBJ` cuando la vista entra en voxel fallback.

No afecta el morph 2D.

Interpretacion:

- valores bajos: menos voxeles, previsualizacion mas ligera y mas rapida
- valores altos: mas densidad, resultado mas lleno y mas suave, pero con mayor costo de CPU y memoria

Una frase util para exponer:

> Este control regula la resolucion del campo volumetrico de respaldo. Mas resolucion da una mejor aproximacion espacial, pero cuesta mas computacionalmente.

---

## 10. Render y backend

En `Image Morph`, la composicion visual intenta usar:

1. `WebGPU`
2. `WebGL2`
3. `CPU`

En `OBJ Morph`, la vista actual se renderiza sobre canvas CPU.

Como explicarlo:

> El calculo geometrico principal sigue siendo CPU, pero la composicion final de imagen puede acelerarse con GPU cuando el navegador y el dispositivo lo permiten.

El panel `Renderer` indica el backend realmente activo.
Durante la deteccion inicial puede aparecer `Probing...`, y despues se estabiliza en el backend correcto.

---

## 11. Export y reporte

La demo permite:

- exportar a video el resultado visible
- abrir un reporte de sesion

Que conviene decir:

> El export captura exactamente el canvas que estoy viendo. Eso significa que el archivo exportado refleja el backend y el pipeline activos en ese momento.

El reporte sirve para documentar:

- modo activo
- renderer activo
- backend
- interpolacion
- anotaciones
- diagnostico de aceleracion

---

## 12. Guion sugerido de presentacion en vivo

## Apertura

> Esta demo muestra morphing 2D y 3D con diferentes modelos geometricos. La idea es pasar de una fuente a un destino conservando estructura, no solo mezclando intensidad.

## Paso 1: interfaz

> A la izquierda tengo el control del tiempo, el algoritmo, la interpolacion y el modo de anotacion. A la derecha veo fuente, destino y resultado.

## Paso 2: morph 2D con puntos

> Primero uso puntos correspondientes para fijar landmarks. Con eso puedo hacer warping por malla o thin-plate splines.

## Paso 3: comparar algoritmos

> La malla de Delaunay produce un warp por triangulos, muy estable y rapido. TPS produce una deformacion global mas suave.

## Paso 4: lineas dirigidas

> Si quiero controlar bordes o contornos, uso lineas dirigidas. Aqui importa el sentido de la linea, porque define una orientacion local del campo de deformacion.

## Paso 5: interpolacion

> Una vez calculada la geometria, debo re-muestrear pixeles. Nearest es rapido, bilinear es buen compromiso y bicubic suele dar mejor calidad.

## Paso 6: modo 3D

> En OBJ, si las mallas son compatibles, interpolo vertices directamente. Si no lo son, paso a voxel fallback para no inventar una correspondencia que no existe.

## Paso 7: backend

> El panel Runtime me dice si la composicion final se esta haciendo con WebGPU, WebGL2 o CPU. Eso depende de la capacidad real del navegador y del dispositivo.

## Cierre

> El mensaje clave es que el morphing correcto necesita correspondencias, un modelo geometrico apropiado y una reconstruccion visual consistente.

---

## 13. Preguntas tipicas y respuestas cortas

### Por que no basta con un cross-dissolve?

Porque un cross-dissolve mezcla intensidad, pero no alinea estructura.

### Cuando conviene usar puntos?

Cuando las estructuras son landmarks claros y discretos.

### Cuando conviene usar lineas?

Cuando quiero controlar bordes, contornos o rasgos alargados.

### Cuando conviene TPS?

Cuando busco una deformacion mas suave y global.

### Por que existe voxel fallback?

Porque no siempre hay correspondencia valida entre vertices de dos OBJ distintos.

### Que significa el renderer activo?

Significa donde se esta componiendo visualmente el resultado final: WebGPU, WebGL2 o CPU.

---

## 14. Mensaje final recomendado

> Esta demo no muestra solo una animacion entre dos entradas. Muestra decisiones de modelado: como representar correspondencias, como interpolar geometria, como reconstruir apariencia y como adaptar el pipeline al hardware disponible.
