
const { BigNumber } = require("bignumber.js");
const { expect } = require("chai");
const hardhat = require('hardhat');
const { ethers } = require("hardhat");;

async function getToken() {

  // deploy token
  const tokenFactory = await ethers.getContractFactory("TestToken")
  token = await tokenFactory.deploy('a', 'a', 18);
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
            bias = bias + lock.bias - (timestamp - lock.startTime) * lock.slope
            slope = slope + lock.slope;
            if (slopeChanges[lock.endTime] == undefined) {
                slopeChanges[lock.endTime] = -lock.slope;
            } else {
                slopeChanges[lock.endTime] -= lock.slope;
            }
        }
    }
    return {bias, slope, slopeChanges};
}

describe("test increase unlock time", function () {

    var signer, tester;
    var PUL;
    var vePUL;

    var locks;

    var timestampStart;

    var rewardPerBlock;
    var q128;

    beforeEach(async function() {
      
        [signer, tester, other] = await ethers.getSigners();

        // a fake weth
        const tokenFactory = await ethers.getContractFactory("TestToken");
        PUL = await tokenFactory.deploy('PUL', 'PUL', 18);

        
        const vePULFactory = await ethers.getContractFactory("vePUL");
        vePUL = await vePULFactory.deploy(PUL.address, {
            provider: signer.address,
            accRewardPerShare: 0,
            rewardPerBlock: '100000000000000000',
            lastTouchBlock: 0,
            startBlock: 0,
            endBlock: 1000
        });

        rewardPerBlock = '100000000000000000';

        await PUL.connect(tester).approve(vePUL.address, '100000000000000000000');
        await PUL.mint(tester.address, '100000000000000000000');
        await PUL.connect(other).approve(vePUL.address, '100000000000000000000');
        await PUL.mint(other.address, '100000000000000000000');

        await PUL.approve(vePUL.address, '100000000000000000000');
        await PUL.mint(signer.address, '100000000000000000000');

        const WEEK = Number((await vePUL.WEEK()).toString());

    
        const blockNumStart = await ethers.provider.getBlockNumber();
        const blockStart = await ethers.provider.getBlock(blockNumStart);
        timestampStart = blockStart.timestamp;
        if (timestampStart % WEEK !== 0) {
            timestampStart = timestampStart - timestampStart % WEEK + WEEK;
        }

        await vePUL.connect(tester).createLock('10000000000', timestampStart + WEEK * 21.2);
        await vePUL.connect(other).createLock('20000000000', timestampStart + WEEK * 30);

        q128 = BigNumber(2).pow(128).toFixed(0);
    });


    it("increase Amount of tester, unstaked", async function () {
        const WEEK = Number((await vePUL.WEEK()).toString());

        let balance = (await PUL.balanceOf(tester.address)).toString();
        let ok = true;
        try {
            await vePUL.connect(tester).increaseAmount('1', '5000000000');
        } catch(err) {
            // console.log(err);
            ok = false;
        }
        expect(ok).to.equal(true);
        const lock1 = await vePUL.nftLocked('1');
        expect(lock1.amount.toString()).to.equal('15000000000');
        expect(lock1.end.toString()).to.equal(String(timestampStart + WEEK * 21));
        const lock2 = await vePUL.nftLocked('2');
        expect(lock2.amount.toString()).to.equal('20000000000');
        expect(lock2.end.toString()).to.equal(String(timestampStart + WEEK * 30));

        expect((await PUL.balanceOf(tester.address)).toString()).to.equal(stringMinus(balance, '5000000000'));
    });

    it("increase Amount of tester, staked", async function () {
        const WEEK = Number((await vePUL.WEEK()).toString());
        let balance = (await PUL.balanceOf(tester.address)).toString();
        await vePUL.connect(tester).stake('1');

        // const stakePULAmount = '10000000000';
        // const stakingStatus1 = await vePUL.stakingStatus('1');
        // const acc = stringDiv(stringMul(rewardPerBlock, q128), stakePULAmount);
        // const reward = stringDiv(stringMul(acc, stakingStatus1.lastVePUL.toString()), q128);

        let ok = true;
        try {
            await vePUL.connect(tester).increaseAmount('1', '5000000000');
        } catch(err) {
            // console.log(err);
            ok = false;
        }
        // donot collect reward in increaseAmount()
        balance = stringMinus(balance, '5000000000');

        expect(ok).to.equal(true);
        const lock1 = await vePUL.nftLocked('1');
        expect(lock1.amount.toString()).to.equal('15000000000');
        expect(lock1.end.toString()).to.equal(String(timestampStart + WEEK * 21));
        const lock2 = await vePUL.nftLocked('2');
        expect(lock2.amount.toString()).to.equal('20000000000');
        expect(lock2.end.toString()).to.equal(String(timestampStart + WEEK * 30));
        expect((await PUL.balanceOf(tester.address)).toString()).to.equal(balance);
    });

    it("increase Amount of other, unstaked", async function () {
        const WEEK = Number((await vePUL.WEEK()).toString());
        let balance = (await PUL.balanceOf(tester.address)).toString();
        let balance2 = (await PUL.balanceOf(other.address)).toString();

        let ok = true;
        try {
            await vePUL.connect(tester).increaseAmount('2', '5000000000');
        } catch(err) {
            // console.log(err);
            ok = false;
        }
        expect(ok).to.equal(true);
        const lock1 = await vePUL.nftLocked('1');
        expect(lock1.amount.toString()).to.equal('10000000000');
        expect(lock1.end.toString()).to.equal(String(timestampStart + WEEK * 21));
        const lock2 = await vePUL.nftLocked('2');
        expect(lock2.amount.toString()).to.equal('25000000000');
        expect(lock2.end.toString()).to.equal(String(timestampStart + WEEK * 30));
        expect((await PUL.balanceOf(tester.address)).toString()).to.equal(stringMinus(balance, '5000000000'));
        expect((await PUL.balanceOf(other.address)).toString()).to.equal(balance2);
    });
    it("increase Amount of other, staked", async function () {
        const WEEK = Number((await vePUL.WEEK()).toString());
        let balance = (await PUL.balanceOf(tester.address)).toString();
        let balance2 = (await PUL.balanceOf(other.address)).toString();
        await vePUL.connect(other).stake('2');

        const stakePULAmount = '20000000000';
        const stakingStatus2 = await vePUL.stakingStatus('2');
        const acc = stringDiv(stringMul(rewardPerBlock, q128), stakePULAmount);
        const reward = stringDiv(stringMul(acc, stakingStatus2.lastVePUL.toString()), q128);

        let ok = true;
        try {
            await vePUL.connect(tester).increaseAmount('2', '5000000000');
        } catch(err) {
            console.log(err);
            ok = false;
        }
        expect(ok).to.equal(true);
        const lock1 = await vePUL.nftLocked('1');
        expect(lock1.amount.toString()).to.equal('10000000000');
        expect(lock1.end.toString()).to.equal(String(timestampStart + WEEK * 21));
        const lock2 = await vePUL.nftLocked('2');
        expect(lock2.amount.toString()).to.equal('25000000000');
        expect(lock2.end.toString()).to.equal(String(timestampStart + WEEK * 30));
        expect((await PUL.balanceOf(tester.address)).toString()).to.equal(stringMinus(balance, '5000000000'));
        // donot get reward in increaseAmount
        expect((await PUL.balanceOf(other.address)).toString()).to.equal(balance2);
    });
});