# Math

Using [numbers](/types/number), number operators, and math functions.

## Numeric values: 0, 1, 2, 6.7, 10.083...

Just numbers by themselves. Sometimes these are called _numeric literals_.

### Integers: whole numbers

```block
let num = 0;
num = 0;
num = 1;
num = 2;
```
### Floating point: numbers with a fractional part

Numbers can have their fractional part too. The decimal point is between the digits of the number.
But, _floating point_ numbers have the decimal point at any spot between digits, like: 3.14159 or 651.75.

```block
let num = 0
num = 6.7
num = 10.083
```

## Arithmetic binary operation (+, -, *, /)

The operations for basic arithmetic: add, subtract, multiply, and divide.

```block
let more = 0+1;
let less = 0-1;
let twice = 1*2;
let divide = 8/4;
```

### Remainder (%)
This is a extra operator for division. You can find out how much is left over if one number doesn't
divide into the other number evenly.

We know that 4 / 2 = 2, so 2 divides into 4 evenly. But, 5 / 2 = 2 with a remainder of 1. So, the 
remainder operation, 5 % 2 = 1, gives the number that's left over from a division operation.

```block
let remainder = 7%4;
```

## Absolute value

When you want to know how much a number is without it's _sign_ (+/-). The absolute value of -5 is 5 and the 
the absolute value 5 is also 5. The absolute value is sometimes called the _magnitude_.

```block
let item = Math.abs(-5);
```

## Minimum and maximum of two values

You can get the smaller or the bigger of two numbers with the min() and max() functions.

* The minimum of 2 and 9: **Math.min(2, 9)** equals 2.
* The maximum of 3 and 9: **Math.max(3, 9)** equals 9.

```block
let minval = Math.min(0, 1);
let maxval = Math.max(8, 2);
```

## Random value

Make up any number from 0 to some maximum value. If you want a random number up to
100, say: **Math.random(100)**.

```block
let myRandom = Math.random(5);
```

## Constrain
Make certain that the value of a number you give is no smaller and no bigger than two other
numbers. So, **Math.constrain(15, 6, 10)** equals 10 and **Math.constrain(3, 6, 10)**
equals 6.

```block
let limited = Math.constrain(10, 0, 9);
```

## Trigonometry
Functions for finding numbers of angles, sides of triangles, and positions on a circle. These
functions are also used to make information for wave signals.

### Sine

Get the length of the vertical (up or down) side of a right triangle at some angle. But, the
_sine_ value is the length of the vertical side divided by the length of the longest side,
it's _hypotenuse_.

What's the sine of 60 degrees? **Math.sin(60)** equals 0.5. The vertical side of a right triangle
is one half the length of the longest side when the opposite angle is 60 degrees.

```block
let ySide = Math.sin(60)
```

### Cosine

Get the length of the horizontal (left or right) side of a right triangle at some angle. But, the
_cosine_ value is the length of the horizontal side divided by the length of the longest side,
it's _hypotenuse_.

What's the cosine of 45 degrees? **Math.cos(45)** equals 0.707. The length of the horizontal side
of a right triangle is about 70 percent of the length of the longest side when the angle between them
is 45 degrees.

```block
let xSide = Math.cos(45)
```

## Map
A _map_ is a conversion of one span of numbers to another. If a dog can live to 16 years and a person
lives to 87 years, how do you make a 16 year life span seem like a 87 year live span? You say that one
dog year is like some number of people years. This is a _mapping_ of dog years to people years.

Fahrenheit and Celsius are different ways to measure temperature. Celsius doesn't use the same amount of
degrees as Fahrenheit. So, there is more energy in one degree of Celsius. If you want to convert a
temperature value of Fahrenheit (something between freezing and boiling maybe) to Celsius, you can use
**Math.map(50, 32, 212, 0, 100)**. The map makes 50 degrees of Fahrenheit turn into 10 degrees of Celsius.

```block
let dogsAge = 7
let peoplesAge = Math.map(dogsAge, 1, 16, 15, 87)
```