const { BigNumber } = require("bignumber.js");
const { expect } = require("chai");
const hardhat = require("hardhat");
const { ethers } = require("hardhat");

async function getToken() {
  // deploy token
  const tokenFactory = await ethers.getContractFactory("TestToken");
  token = await tokenFactory.deploy("a", "a", 18);
  await token.deployed();
  return token;
}

function decimalToUnDecimalStr(num) {
  return new BigNumber(num).times(10 ** 18).toFixed(0);
}

function stringDiv(a, b) {
  let an = new BigNumber(a);
  an = an.minus(an.mod(b));
  return an.div(b).toFixed(0, 3);
}

function stringMul(a, b) {
  let an = new BigNumber(a);
  an = an.times(b);
  return an.toFixed(0, 3);
}

function stringMinus(a, b) {
  let an = new BigNumber(a);
  an = an.minus(b);
  return an.toFixed(0, 3);
}

function stringAdd(a, b) {
  let an = new BigNumber(a);
  an = an.plus(b);
  return an.toFixed(0, 3);
}

function getLockData(slope, MAXTIME, startTime, endTime) {
  const amount = slope * MAXTIME;
  const bias = slope * (endTime - startTime);
  return {
    slope,
    amount,
    bias,
    startTime,
    endTime,
  };
}

function getLastPointAndSlopeChanges(locks, timestamp) {
  let bias = 0;
  let slope = 0;
  const slopeChanges = {};
  for (const lock of locks) {
    // it is assumed that lock.startTime <= timestamp
    if (lock.endTime > timestamp) {
      bias = bias + lock.bias - (timestamp - lock.startTime) * lock.slope;
      slope = slope + lock.slope;
      if (slopeChanges[lock.endTime] == undefined) {
        slopeChanges[lock.endTime] = -lock.slope;
      } else {
        slopeChanges[lock.endTime] -= lock.slope;
      }
    }
  }
  return { bias, slope, slopeChanges };
}

async function waitUntilJustBefore(destBlockNumber) {
  let currentBlockNumber = await ethers.provider.getBlockNumber();
  while (currentBlockNumber < destBlockNumber - 1) {
    await ethers.provider.send("evm_mine");
    currentBlockNumber = await ethers.provider.getBlockNumber();
  }
  return currentBlockNumber;
}

async function getStakingStatus(vePUL, nftId) {
  const stakingStatus = await vePUL.stakingStatus(nftId);
  return {
    stakingId: stakingStatus.stakingId.toString(),
    lockAmount: stakingStatus.lockAmount.toString(),
    lastVePUL: stakingStatus.lastVePUL.toString(),
    lastTouchAccRewardPerShare:
      stakingStatus.lastTouchAccRewardPerShare.toString(),
  };
}

async function getStakingInfo(vePUL, tester) {
  const stakingInfo = await vePUL.stakingInfo(tester.address);
  return {
    stakingId: stakingInfo.stakingId.toString(),
    nftId: stakingInfo.nftId.toString(),
    amount: stakingInfo.amount.toString(),
  };
}

async function getRewardInfo(vePUL) {
  const rewardInfo = await vePUL.rewardInfo();
  return {
    provider: rewardInfo.provider,
    accRewardPerShare: rewardInfo.accRewardPerShare.toString(),
    rewardPerBlock: rewardInfo.rewardPerBlock.toString(),
    lastTouchBlock: rewardInfo.lastTouchBlock.toString(),
    startBlock: rewardInfo.startBlock.toString(),
    endBlock: rewardInfo.endBlock.toString(),
  };
}

async function tryCollect(vePUL, PUL, tester) {
  const PULBalanceBefore = (await PUL.balanceOf(tester.address)).toString();
  let ok = true;
  try {
    await vePUL.connect(tester).collect();
  } catch (err) {
    // console.log(err);
    ok = false;
  }
  const PULBalanceAfter = (await PUL.balanceOf(tester.address)).toString();
  return { reward: stringMinus(PULBalanceAfter, PULBalanceBefore), ok };
}

async function tryUnStake(vePUL, PUL, tester) {
  const PULBalanceBefore = (await PUL.balanceOf(tester.address)).toString();
  let ok = true;
  try {
    await vePUL.connect(tester).unStake();
  } catch (err) {
    ok = false;
  }
  const PULBalanceAfter = (await PUL.balanceOf(tester.address)).toString();
  return { reward: stringMinus(PULBalanceAfter, PULBalanceBefore), ok };
}

async function tryStake(vePUL, nftId, tester) {
  let ok = true;
  try {
    await vePUL.connect(tester).stake(nftId);
  } catch (err) {
    ok = false;
  }
  return ok;
}

describe("test increase unlock time", function () {
  var signer, tester;
  var PUL;
  var vePUL;

  var timestampStart;
  var rewardPerBlock;

  var q128;

  beforeEach(async function () {
    [signer, tester, other, other2] = await ethers.getSigners();

    // a fake weth
    const tokenFactory = await ethers.getContractFactory("TestToken");
    PUL = await tokenFactory.deploy("PUL", "PUL", 18);

    const vePULFactory = await ethers.getContractFactory("vePUL");
    rewardPerBlock = "1200000000000000";
    vePUL = await vePULFactory.deploy(PUL.address, {
      provider: signer.address,
      accRewardPerShare: 0,
      rewardPerBlock: rewardPerBlock,
      lastTouchBlock: 0,
      startBlock: 0,
      endBlock: 10000,
    });

    await PUL.connect(tester).approve(vePUL.address, "100000000000000000000");
    await PUL.mint(tester.address, "100000000000000000000");
    await PUL.connect(other).approve(vePUL.address, "100000000000000000000");
    await PUL.mint(other.address, "100000000000000000000");
    await PUL.connect(other2).approve(vePUL.address, "100000000000000000000");
    await PUL.mint(other2.address, "100000000000000000000");
    await PUL.connect(signer).approve(vePUL.address, "100000000000000000000");
    await PUL.mint(signer.address, "100000000000000000000");

    const WEEK = Number((await vePUL.WEEK()).toString());

    const blockNumStart = await ethers.provider.getBlockNumber();
    const blockStart = await ethers.provider.getBlock(blockNumStart);
    timestampStart = blockStart.timestamp;
    if (timestampStart % WEEK !== 0) {
      timestampStart = timestampStart - (timestampStart % WEEK) + WEEK;
    }

    await vePUL
      .connect(tester)
      .createLock("220000000000000000", timestampStart + WEEK * 35);
    await vePUL
      .connect(other)
      .createLock("190000000000000000", timestampStart + WEEK * 35);
    await vePUL
      .connect(tester)
      .createLock("280000000000000000", timestampStart + WEEK * 30);
    await vePUL
      .connect(other)
      .createLock("310000000000000000", timestampStart + WEEK * 30);
    await vePUL
      .connect(other2)
      .createLock("350000000000000000", timestampStart + WEEK * 40);
    await vePUL
      .connect(other2)
      .createLock("360000000000000000", timestampStart + WEEK * 41);
    await vePUL
      .connect(other2)
      .createLock("370000000000000000", timestampStart + WEEK * 42);

    q128 = BigNumber(2).pow(128).toFixed(0);
  });

  it("stake same nft again", async function () {
    const WEEK = Number((await vePUL.WEEK()).toString());
    const MAXTIME = Number((await vePUL.MAXTIME()).toString());

    expect((await vePUL.ownerOf("1")).toLowerCase()).to.equal(
      tester.address.toLowerCase()
    );
    const ok1 = await tryStake(vePUL, "1", tester);
    expect(ok1).to.equal(true);
    expect((await vePUL.stakedNft(tester.address)).toString()).to.equal("1");
    expect((await vePUL.ownerOf("1")).toLowerCase()).to.equal(
      vePUL.address.toLowerCase()
    );

    const ok2 = await tryStake(vePUL, "1", tester);
    expect(ok2).to.equal(false);
    expect((await vePUL.stakedNft(tester.address)).toString()).to.equal("1");

    const startTime1 = timestampStart + Math.round(WEEK * 5.2);
    await ethers.provider.send("evm_setNextBlockTimestamp", [startTime1]);
    const end1 = timestampStart + WEEK * 35;
    const stakingInfo = await getStakingInfo(vePUL, tester);
    expect(stakingInfo.nftId).to.equal("1");
    expect(stakingInfo.stakingId).to.equal("1");
    const slope = stringDiv("220000000000000000", MAXTIME);
    expect(stakingInfo.amount, stringMul(slope, stringMinus(end1, startTime1)));
  });

  it("stake twice", async function () {
    const WEEK = Number((await vePUL.WEEK()).toString());
    const MAXTIME = Number((await vePUL.MAXTIME()).toString());

    const ok1 = await tryStake(vePUL, "1", tester);
    expect(ok1).to.equal(true);
    expect((await vePUL.stakedNft(tester.address)).toString()).to.equal("1");

    const ok2 = await tryStake(vePUL, "3", tester);
    expect(ok2).to.equal(false);
    expect((await vePUL.stakedNft(tester.address)).toString()).to.equal("1");
    expect((await vePUL.ownerOf("3")).toLowerCase()).to.equal(
      tester.address.toLowerCase()
    );

    const startTime1 = timestampStart + Math.round(WEEK * 5.2);
    await ethers.provider.send("evm_setNextBlockTimestamp", [startTime1]);
    const end1 = timestampStart + WEEK * 35;
    const stakingInfo = await getStakingInfo(vePUL, tester);
    expect(stakingInfo.nftId).to.equal("1");
    expect(stakingInfo.stakingId).to.equal("1");
    const slope = stringDiv("220000000000000000", MAXTIME);
    expect(stakingInfo.amount, stringMul(slope, stringMinus(end1, startTime1)));
  });

  it("stake other nft", async function () {
    const ok1 = await tryStake(vePUL, "2", tester);
    expect(ok1).to.equal(false);
    expect((await vePUL.stakedNft(tester.address)).toString()).to.equal("0");
    expect((await vePUL.ownerOf("2")).toLowerCase()).to.equal(
      other.address.toLowerCase()
    );

    const { reward, ok: okCollect } = await tryCollect(vePUL, PUL, tester);
    expect(reward).to.equal("0");
    expect(okCollect).to.equal(false);

    const stakingInfo = await getStakingInfo(vePUL, tester);
    expect(stakingInfo.nftId).to.equal("0");
    expect(stakingInfo.stakingId).to.equal("0");
    expect(stakingInfo.amount, "0");
  });

  it("nostake and unstake", async function () {
    const { reward, ok: okUnstake } = await tryUnStake(vePUL, PUL, tester);
    expect(okUnstake).to.equal(false);
    expect(reward).to.equal("0");
    expect((await vePUL.stakedNft(tester.address)).toString()).to.equal("0");
    expect((await vePUL.ownerOf("1")).toLowerCase()).to.equal(
      tester.address.toLowerCase()
    );

    const stakingInfo = await getStakingInfo(vePUL, tester);
    expect(stakingInfo.nftId).to.equal("0");
    expect(stakingInfo.stakingId).to.equal("0");
    expect(stakingInfo.amount, "0");
  });

  it("stakingId changed", async function () {
    await tryStake(vePUL, "1", tester);
    let stakingInfo = await getStakingInfo(vePUL, tester);
    expect(stakingInfo.nftId).to.equal("1");
    expect(stakingInfo.stakingId).to.equal("1");

    await tryStake(vePUL, "2", other);
    stakingInfo = await getStakingInfo(vePUL, tester);
    expect(stakingInfo.nftId).to.equal("1");
    expect(stakingInfo.stakingId).to.equal("1");

    await tryUnStake(vePUL, PUL, tester);
    stakingInfo = await getStakingInfo(vePUL, tester);
    expect(stakingInfo.nftId).to.equal("0");
    expect(stakingInfo.stakingId).to.equal("0");

    await tryStake(vePUL, "1", tester);
    stakingInfo = await getStakingInfo(vePUL, tester);
    expect(stakingInfo.nftId).to.equal("1");
    expect(stakingInfo.stakingId).to.equal("3");
  });
});
