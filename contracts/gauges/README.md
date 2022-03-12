# PulsarDAO-Contracts/contracts/gauges

Contracts used for measuring provided liquidity within Pulsar pools.

You can read the [documentation](https://pulsar.readthedocs.io/dao-gauges.html) to learn more about Pulsar gauges.

## Contracts

* [`LiquidityGaugeV3`](LiquidityGaugeV3.vy): Tokenized liquidity gauge further optimized for gas efficiency.
* [`LiquidityGaugeV2`](LiquidityGaugeV2.vy): Tokenized liquidity gauge with generalized onward staking and support for multiple reward tokens.
* [`LiquidityGauge`](LiquidityGauge.vy): Measures the amount of liquidity provided by each user.
* [`LiquidityGaugeReward`](LiquidityGaugeReward.vy): Measures provided liquidity and stakes using the [Synthetix rewards contract](https://github.com/PulsarSwap/unipool-fork).
* [`RewardsOnlyGauge`](RewardsOnlyGauge.vy): Handles distribution of 3rd-party incentives without receiving PUL emissions. Typically used on sidechains.
